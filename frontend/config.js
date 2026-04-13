// config.js
// Deteksi URL secara otomatis untuk mendukung localhost, IP lokal, dan ngrok

(function() {
    // Ambil URL saat ini (localhost, IP, atau ngrok)
    const currentUrl = window.location.origin;
    
    // Set API endpoint dan APPROOT
    const API = currentUrl + "/api";
    const APPROOT = currentUrl;
    
    // Simpan ke window object agar bisa diakses global
    window.API = API;
    window.APPROOT = APPROOT;
    
    // Debug logging
    console.log("╔════════════════════════════════════════╗");
    console.log("║         CONFIG.JS LOADED               ║");
    console.log("╠════════════════════════════════════════╣");
    console.log("║ Current URL: " + currentUrl);
    console.log("║ API: " + API);
    console.log("║ APPROOT: " + APPROOT);
    console.log("╚════════════════════════════════════════╝");
    
    // Optional: Simpan juga ke localStorage untuk backup
    localStorage.setItem("api_url", API);
    localStorage.setItem("app_root", APPROOT);
})();