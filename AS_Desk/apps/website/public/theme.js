// Light by default; apply a theme the visitor picked before first paint to avoid a flash.
// Loaded as a blocking script from <head>; kept external so the CSP needs no 'unsafe-inline'.
(function () {
  var theme;
  try {
    theme = localStorage.getItem("asdesk-theme");
  } catch (error) {}
  document.documentElement.classList.toggle("dark", theme === "dark");
})();
