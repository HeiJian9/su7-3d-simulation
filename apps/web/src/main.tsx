import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';
import './polish.css';
import {useWelcomeConnection} from './welcome';
import {RemoteWelcome} from './WelcomeControls';
function SessionApp(){useWelcomeConnection();return location.pathname==='/remote'?<RemoteWelcome/>:<App/>;}

createRoot(document.getElementById('root')!).render(<StrictMode><SessionApp /></StrictMode>);
