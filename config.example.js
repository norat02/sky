// Sao chép file này thành config.js rồi điền thông tin từ Supabase Dashboard.
// Không đặt service_role key ở trình duyệt; chỉ dùng public anon/publishable key.
window.SKY_CONFIG = {
  PUBLIC_SITE_URL: 'https://your-production-domain.vercel.app/',
  API_BASE_URL: 'https://your-production-domain.vercel.app',
  SUPABASE_URL: 'https://your-project-ref.supabase.co',
  SUPABASE_ANON_KEY: 'your-public-anon-key',
  // Tùy chọn; để trống để tự dùng domain Vercel hiện tại.
  SUPABASE_REDIRECT_URL: 'https://your-production-domain.vercel.app/',
  NATIVE_OAUTH_REDIRECT_SCHEME: 'com.norat02.skybird',
  // Public AdSense publisher ID, dạng ca-pub-xxxxxxxxxxxxxxxx.
  ADSENSE_PUBLISHER_ID: 'ca-pub-xxxxxxxxxxxxxxxx'
};
