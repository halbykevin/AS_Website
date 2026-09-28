import { configureStore, createSlice } from '@reduxjs/toolkit';

export type Theme = 'dark' | 'light';

// index.html applies the saved theme (light by default) before first paint; start from what it chose.
const initialTheme = (): Theme =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light';

const themeSlice = createSlice({
  name: 'theme',
  initialState: { value: initialTheme() },
  reducers: { toggle: (state) => { state.value = state.value === 'dark' ? 'light' : 'dark'; } },
});

export const { toggle } = themeSlice.actions;
export const store = configureStore({ reducer: { theme: themeSlice.reducer } });
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
