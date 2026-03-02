import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { createTheme } from '@mui/material/styles';
import DashboardLayout from './layouts/DashboardLayout';
import Dashboard from './pages/Dashboard';
import Costs from './pages/Costs';
import Agents from './pages/Agents';
import Projects from './pages/Projects';
import Activity from './pages/Activity';
import NLP from './pages/NLP';
import Models from './pages/Models';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#9c27b0',
      light: '#ce93d8',
      dark: '#7b1fa2',
    },
    secondary: {
      main: '#e91e63',
      light: '#f48fb1',
      dark: '#c2185b',
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
    text: {
      primary: '#2b2b2b',
      secondary: '#757575',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 500,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#1a1a2e',
          color: '#fff',
        },
      },
    },
  },
});

const darkTheme = createTheme({
  ...theme,
  palette: {
    mode: 'dark',
    primary: theme.palette.primary,
    secondary: theme.palette.secondary,
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
    text: {
      primary: '#fff',
      secondary: '#b0b0b0',
    },
  },
});

function App() {
  const [darkMode, setDarkMode] = useState(false);
  const currentTheme = darkMode ? darkTheme : theme;

  return (
    <ThemeProvider theme={currentTheme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<DashboardLayout darkMode={darkMode} setDarkMode={setDarkMode} />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="costs" element={<Costs />} />
            <Route path="agents" element={<Agents />} />
            <Route path="projects" element={<Projects />} />
            <Route path="activity" element={<Activity />} />
            <Route path="nlp" element={<NLP />} />
            <Route path="models" element={<Models />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;