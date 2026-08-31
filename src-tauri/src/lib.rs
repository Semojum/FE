mod perf;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        // 개발자 모드 오버레이가 읽는 프로세스 계측 (RAM·CPU)
        .manage(perf::PerfState::default())
        .invoke_handler(tauri::generate_handler![perf::perf_snapshot]);

    // 자동 업데이트 플러그인은 데스크톱 전용
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
