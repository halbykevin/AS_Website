// Google Analytics (GA4) setup, paired with the gtag.js loader in index.html.
// Kept external, like theme.js, so the CSP needs no 'unsafe-inline'.
window.dataLayer = window.dataLayer || [];
function gtag() {
  dataLayer.push(arguments);
}
gtag("js", new Date());
gtag("config", "G-0DHGELZFD6");
