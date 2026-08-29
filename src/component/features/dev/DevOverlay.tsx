import React, { useEffect, useRef, useState } from 'react';
import { Activity, ChevronDown, ChevronUp, X } from 'lucide-react';
import { readBus, subscribe, type PerfBusSnapshot } from '../../../utils/perfBus';

// 개발자 모드 오버레이 — 화면 오른쪽 아래 구석에 프로파일 수치를 띄운다.
//
// 웹뷰 안에서 볼 수 있는 값(JS 힙)과 앱이 실제로 쓰는 값은 크게 다르다.
// 2026-08-27 인수시험에서 JS 힙 7MB일 때 렌더러 프로세스는 1.2GB였다 — 그래서
// RAM·CPU는 네이티브(perf_snapshot)에서 읽고, JS 힙은 참고로 나란히 보여 준다.

interface NativeStat {
  rss_mb: number;
  cpu_pct: number;
  process_count: number;
  top_rss_mb: number;
  total_mem_mb: number;
  used_mem_mb: number;
  cpu_count: number;
}

const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// 프레임 간격으로 본 멈춤 — 사용자가 "버벅인다"고 느끼는 그 값이다.
const useJank = () => {
  const [jank, setJank] = useState({ worst: 0, over50: 0 });
  useEffect(() => {
    let last = performance.now();
    let worst = 0;
    let over50 = 0;
    let raf = 0;
    let alive = true;
    const loop = () => {
      if (!alive) return;
      const n = performance.now();
      const d = n - last;
      last = n;
      if (d > 50) {
        over50 += 1;
        if (d > worst) worst = d;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const id = window.setInterval(() => setJank({ worst, over50 }), 500);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.clearInterval(id);
    };
  }, []);
  return jank;
};

// 200ms를 넘는 작업 — 이 구간에는 입력이 밀린다.
const useLongTasks = () => {
  const [lt, setLt] = useState({ count: 0, worst: 0 });
  const ref = useRef({ count: 0, worst: 0 });
  useEffect(() => {
    let po: PerformanceObserver | null = null;
    try {
      po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          ref.current.count += 1;
          ref.current.worst = Math.max(ref.current.worst, Math.round(e.duration));
        }
      });
      po.observe({ entryTypes: ['longtask'] });
    } catch {
      /* longtask를 모르는 엔진이면 비워 둔다 */
    }
    const id = window.setInterval(() => setLt({ ...ref.current }), 500);
    return () => {
      po?.disconnect();
      window.clearInterval(id);
    };
  }, []);
  return lt;
};

const Row: React.FC<{ label: string; value: string; warn?: boolean }> = ({
  label,
  value,
  warn,
}) => (
  <div className="flex items-baseline justify-between gap-3">
    <span className="text-[10px] text-white/50">{label}</span>
    <span
      className={`font-mono text-[11px] tabular-nums ${warn ? 'text-[#ffb4a2]' : 'text-white/90'}`}
    >
      {value}
    </span>
  </div>
);

interface Props {
  version: string;
  onExitRequest: () => void;
}

const DevOverlay: React.FC<Props> = ({ version, onExitRequest }) => {
  const [native, setNative] = useState<NativeStat | null>(null);
  const [nativeError, setNativeError] = useState<string | null>(null);
  const [bus, setBus] = useState<PerfBusSnapshot>(() => readBus());
  const [jsHeap, setJsHeap] = useState<number | null>(null);
  const [open, setOpen] = useState(true);
  const jank = useJank();
  const longTasks = useLongTasks();

  // 계측 버스 구독 — 요청·작업이 들어올 때만 다시 그린다.
  useEffect(() => subscribe(() => setBus(readBus())), []);

  // 네이티브 계측은 1초마다. sysinfo의 CPU는 두 번의 갱신 사이 변화량이라
  // 간격이 일정해야 값이 튀지 않는다.
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    let invoke: ((cmd: string) => Promise<unknown>) | null = null;
    const tick = async () => {
      try {
        if (!invoke) {
          const m = await import('@tauri-apps/api/core');
          invoke = m.invoke as (cmd: string) => Promise<unknown>;
        }
        const v = (await invoke('perf_snapshot')) as NativeStat;
        if (alive) {
          setNative(v);
          setNativeError(null);
        }
      } catch (e) {
        if (alive) setNativeError(String(e).slice(0, 60));
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 1000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  // JS 힙은 참고값 — 크롬 계열에서만 있다. 그리고 **위 RAM과 견주면 안 되는** 값이다:
  // 캔버스 백킹 스토어와 pdf.js가 스캔 이미지를 푸는 버퍼는 V8 힙 밖이라 여기 안 잡힌다.
  // 2026-08-27 인수시험에서 이 값이 7MB일 때 렌더러는 1,236MB였다. 스캔본이 무거울 때
  // 봐야 할 것은 이 줄이 아니라 위의 RAM이다.
  useEffect(() => {
    const id = window.setInterval(() => {
      const mem = (
        performance as Performance & { memory?: { usedJSHeapSize: number } }
      ).memory;
      setJsHeap(mem ? mem.usedJSHeapSize / 1048576 : null);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const cpuPerCore = native ? native.cpu_pct / Math.max(1, native.cpu_count) : 0;

  return (
    <div
      role="complementary"
      aria-label="개발자 모드 계측"
      className="pointer-events-auto fixed bottom-3 right-3 z-[75] w-[248px] select-none rounded-lg border border-white/10 bg-[#12181f]/95 p-2.5 shadow-xl backdrop-blur-sm"
    >
      <div className="flex items-center gap-1.5">
        <Activity size={12} className="shrink-0 text-[#7fb4dc]" />
        <span className="flex-1 text-[11px] font-semibold text-white/80">
          개발자 모드
        </span>
        <span className="font-mono text-[10px] text-white/40">v{version}</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? '접기' : '펼치기'}
          className="rounded p-0.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
        >
          {open ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>
        <button
          type="button"
          onClick={onExitRequest}
          title="메인 모드로 나가기"
          aria-label="메인 모드로 나가기"
          className="rounded p-0.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
        >
          <X size={12} />
        </button>
      </div>

      {open && (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            {native ? (
              <>
                <Row
                  label="RAM (앱 전체)"
                  value={`${native.rss_mb.toFixed(0)} MB · ${native.process_count}개`}
                  warn={native.rss_mb > 1500}
                />
                <Row
                  label="  ↳ 최대 프로세스"
                  value={`${native.top_rss_mb.toFixed(0)} MB`}
                />
                <Row
                  label="CPU"
                  value={`${cpuPerCore.toFixed(1)}% · ${native.cpu_count}코어`}
                  warn={cpuPerCore > 60}
                />
                <Row
                  label="기기 메모리"
                  value={`${(native.used_mem_mb / 1024).toFixed(1)} / ${(native.total_mem_mb / 1024).toFixed(1)} GB`}
                />
              </>
            ) : (
              <Row
                label="RAM · CPU"
                value={nativeError ? '읽기 실패' : isTauri() ? '측정 중…' : '앱에서만'}
                warn={!!nativeError}
              />
            )}
            <Row
              // 이름에 단서를 단다 — 이 숫자만 보고 "메모리 문제 없다"로 읽는 것을 막는다.
              label="JS 힙 (그림·디코드 제외)"
              value={jsHeap === null ? '—' : `${jsHeap.toFixed(1)} MB`}
            />
          </div>

          <div className="flex flex-col gap-0.5 border-t border-white/10 pt-1.5">
            <Row
              label="TTFB (중앙값)"
              value={bus.ttfbMedian === null ? '—' : `${bus.ttfbMedian} ms`}
              warn={(bus.ttfbMedian ?? 0) > 1000}
            />
            <Row
              label="TTFB (직전)"
              value={bus.ttfbLast === null ? '—' : `${bus.ttfbLast} ms`}
            />
            <Row
              label="요청 실패"
              value={`${bus.failures}건`}
              warn={bus.failures > 0}
            />
          </div>

          <div className="flex flex-col gap-0.5 border-t border-white/10 pt-1.5">
            <Row
              label="멈춤(최악 프레임)"
              value={`${jank.worst.toFixed(0)} ms`}
              warn={jank.worst > 200}
            />
            <Row label="느린 프레임" value={`${jank.over50}건`} />
            <Row
              label="롱태스크"
              value={`${longTasks.count}건 · 최장 ${longTasks.worst}ms`}
              warn={longTasks.worst > 200}
            />
          </div>

          {(bus.ops.length > 0 || bus.http.length > 0) && (
            <div className="flex flex-col gap-1 border-t border-white/10 pt-1.5">
              <span className="text-[10px] text-white/40">최근 동작</span>
              <div className="flex max-h-[104px] flex-col gap-0.5 overflow-y-auto pr-0.5">
                {[...bus.ops]
                  .slice(-4)
                  .reverse()
                  .map((o, i) => (
                    <div
                      key={`op-${o.t}-${i}`}
                      className="flex items-baseline justify-between gap-2"
                    >
                      <span className="truncate text-[10px] text-white/60">
                        {o.name}
                      </span>
                      <span
                        className={`shrink-0 font-mono text-[10px] tabular-nums ${o.ms > 1000 ? 'text-[#ffb4a2]' : 'text-white/70'}`}
                      >
                        {o.ms}ms
                      </span>
                    </div>
                  ))}
                {[...bus.http]
                  .slice(-4)
                  .reverse()
                  .map((h, i) => (
                    <div
                      key={`http-${h.t}-${i}`}
                      className="flex items-baseline justify-between gap-2"
                    >
                      <span className="truncate text-[10px] text-white/40">
                        {h.label}
                      </span>
                      <span
                        className={`shrink-0 font-mono text-[10px] tabular-nums ${h.ok ? 'text-white/50' : 'text-[#ffb4a2]'}`}
                      >
                        {h.ok ? `${h.ttfb}ms` : `✕ ${h.status || '실패'}`}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <p className="text-[9.5px] leading-snug text-white/30">
            버전 배지를 {}
            일곱 번 누르면 메인 모드로 돌아갑니다.
          </p>
        </div>
      )}
    </div>
  );
};

export default DevOverlay;
