import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import CharacterSelect from "./pages/CharacterSelect";
import GamePage from "./pages/Game";
import Leaderboard from "./pages/Leaderboard";
import MultiplayerLobby from "./pages/MultiplayerLobby";
import Daily from "./pages/Daily";

export default function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/play" element={<CharacterSelect />} />
            <Route path="/coop" element={<MultiplayerLobby />} />
            <Route path="/daily" element={<Daily />} />
            <Route path="/game" element={<GamePage />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}
