// Babylon side-effect modules (prototype extensions used by the game)
import '@babylonjs/core/Meshes/thinInstanceMesh';
import '@babylonjs/core/Meshes/instancedMesh';
import './ui/style.css';
import { Game } from './Game';

const game = new Game(document.getElementById('game') as HTMLCanvasElement, document.getElementById('ui')!);
game.boot();
if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
