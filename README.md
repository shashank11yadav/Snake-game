# Snake Game

A simple Snake Game implemented using JavaScript and HTML5 Canvas.

## Overview
This is a classic Snake Game where the player controls a snake that moves around the screen, consuming food to grow in size. The game ends when the snake collides with the boundaries of the canvas.

## Features
- Dynamic snake movement with keyboard controls (Arrow keys)
- Food spawning at random locations
- Score tracking system
- Game over alert when the snake hits the boundary
- Simple UI with images for the snake, food, and trophy

## Technologies Used
- JavaScript
- HTML5 Canvas
- CSS (for background styling)

## How to Play
1. Open the `index.html` file in a browser.
2. Use the arrow keys to move the snake:
   - `ArrowRight` → Move right
   - `ArrowLeft` → Move left
   - `ArrowUp` → Move up
   - `ArrowDown` → Move down
3. Eat the food (apple) to increase the score.
4. Avoid hitting the edges of the canvas, or the game will be over.

## File Structure
- `index.html` - Main HTML file containing the canvas element.
- `Snake.js` - JavaScript file handling game logic, rendering, and user input.
- `Assets/` - Folder containing images (apple, snake body, trophy, background).

## Future Improvements
- Add obstacles to increase difficulty.
- Implement snake self-collision detection.
- Add a restart button after game over.
- Improve UI with better graphics and animations.
