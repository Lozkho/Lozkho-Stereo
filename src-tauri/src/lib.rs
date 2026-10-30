// Librería principal de Lozkho Stereo (Tauri 2.x)
//
// Carga la PWA estática generada por Next.js en una ventana nativa.
// La persistencia se maneja en el frontend con localStorage, así que
// el backend Rust es mínimo (solo orquesta la ventana).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| {
            #[cfg(debug_assertions)]
            {
                use tauri::Manager;
                if let Some(window) = _app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
