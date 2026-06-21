// Centralized keyboard state + edge-triggered "pressed this frame" events.
export class Input {
  constructor(domElement = window) {
    this.down = new Set();
    this.pressedThisFrame = new Set();
    this._dom = domElement;

    this._onKeyDown = (e) => {
      const code = e.code;
      if (!this.down.has(code)) this.pressedThisFrame.add(code);
      this.down.add(code);
      // prevent page scrolling with space / arrows during play
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) e.preventDefault();
    };
    this._onKeyUp = (e) => this.down.delete(e.code);

    domElement.addEventListener('keydown', this._onKeyDown);
    domElement.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', () => this.down.clear());
  }

  isDown(code) { return this.down.has(code); }
  /** true only on the first frame the key went down */
  wasPressed(code) { return this.pressedThisFrame.has(code); }

  /** call once per frame AFTER reading wasPressed() */
  endFrame() { this.pressedThisFrame.clear(); }

  dispose() {
    this._dom.removeEventListener('keydown', this._onKeyDown);
    this._dom.removeEventListener('keyup', this._onKeyUp);
  }
}
