import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import KanjiFlashcards from './pages/KanjiFlashcards';
import { Toaster } from './components/ui/sonner';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background">
        <Routes>
          <Route path="/" element={<KanjiFlashcards />} />
        </Routes>
        <Toaster position="bottom-right" />
      </div>
    </Router>
  );
}

export default App;
