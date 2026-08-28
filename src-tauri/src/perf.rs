//! 개발자 모드 오버레이가 쓰는 프로세스 계측.
//!
//! 웹뷰에서는 앱이 실제로 얼마나 쓰는지 볼 수 없다. `performance.memory`는 JS 힙만
//! 알려 주는데, 2026-08-27 인수시험에서 JS 힙이 7MB일 때 렌더러 프로세스는 1.2GB였다
//! — 정작 봐야 할 값이 화면에 안 잡힌다. CPU도 마찬가지다.
//!
//! 그래서 여기서 **앱 프로세스 트리**(자기 자신 + WebView2 자식들)를 합쳐서 넘긴다.
//! 이름으로 고르면 다른 앱이 띄운 WebView2까지 딸려 오므로 부모-자식으로 따라간다.

use std::collections::HashSet;
use std::sync::Mutex;

use serde::Serialize;
use sysinfo::{Pid, ProcessRefreshKind, RefreshKind, System};

#[derive(Serialize, Clone, Default)]
pub struct PerfSnapshot {
    /// 프로세스 트리 합계 (MB)
    pub rss_mb: f64,
    /// 프로세스 트리 합계 CPU 사용률 (%) — 코어 수로 나누지 않은 합이다.
    pub cpu_pct: f32,
    /// 트리에 잡힌 프로세스 수
    pub process_count: usize,
    /// 가장 무거운 프로세스 (보통 웹뷰 렌더러)
    pub top_rss_mb: f64,
    /// 이 기기 전체
    pub total_mem_mb: f64,
    pub used_mem_mb: f64,
    pub cpu_count: usize,
}

/// sysinfo는 CPU 사용률을 **두 번의 refresh 사이 변화량**으로 계산한다.
/// 매번 새로 만들면 항상 0이 나오므로 System을 들고 있는다.
pub struct PerfState(Mutex<System>);

impl Default for PerfState {
    fn default() -> Self {
        let mut sys = System::new_with_specifics(
            RefreshKind::new().with_processes(ProcessRefreshKind::everything()),
        );
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        Self(Mutex::new(sys))
    }
}

/// 우리 프로세스에서 뻗은 자식들을 모은다(깊이 제한 — 순환·기형 트리 방어).
fn tree_of(sys: &System, root: Pid) -> HashSet<Pid> {
    let mut want: HashSet<Pid> = HashSet::new();
    want.insert(root);
    for _ in 0..5 {
        let mut added = false;
        for (pid, proc_) in sys.processes() {
            if let Some(parent) = proc_.parent() {
                if want.contains(&parent) && want.insert(*pid) {
                    added = true;
                }
            }
        }
        if !added {
            break;
        }
    }
    want
}

#[tauri::command]
pub fn perf_snapshot(state: tauri::State<'_, PerfState>) -> Result<PerfSnapshot, String> {
    let mut sys = state.0.lock().map_err(|e| e.to_string())?;
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    sys.refresh_memory();

    let me = Pid::from_u32(std::process::id());
    let tree = tree_of(&sys, me);

    let mut rss: u64 = 0;
    let mut cpu: f32 = 0.0;
    let mut top: u64 = 0;
    let mut count = 0usize;
    for pid in &tree {
        if let Some(p) = sys.process(*pid) {
            let m = p.memory();
            rss += m;
            top = top.max(m);
            cpu += p.cpu_usage();
            count += 1;
        }
    }

    const MB: f64 = 1024.0 * 1024.0;
    Ok(PerfSnapshot {
        rss_mb: rss as f64 / MB,
        cpu_pct: cpu,
        process_count: count,
        top_rss_mb: top as f64 / MB,
        total_mem_mb: sys.total_memory() as f64 / MB,
        used_mem_mb: sys.used_memory() as f64 / MB,
        cpu_count: sys.cpus().len().max(1),
    })
}
