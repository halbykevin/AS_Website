module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Path alias: `@/…` → project root. Mirrors the web apps' import style.
      [
        'module-resolver',
        {
          root: ['./'],
          alias: { '@': './' },
          extensions: ['.js', '.jsx', '.json'],
        },
      ],
      // react-native-reanimated's plugin MUST be listed last.
      'react-native-reanimated/plugin',
    ],
  }
}
