/**
 * Simple inventory: collected item defs + a toggleable DOM panel (I to open).
 * Clicking a row inspects that item (handled in main via onInspect).
 */
export class Inventory {
  constructor(onInspect) {
    this.items = [];
    this.isOpen = false;
    this.onInspect = onInspect || (() => {});
    this._buildDOM();
  }

  _buildDOM() {
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(5,6,10,0.82);z-index:15;font-family:Georgia,serif;color:#d8c8b0';
    this.panel = document.createElement('div');
    this.panel.style.cssText = 'width:min(560px,86%);max-height:70%;overflow:auto;border:1px solid #3a2f24;background:rgba(15,10,6,0.92);padding:22px 26px';
    this.el.appendChild(this.panel);
    document.body.appendChild(this.el);
  }

  add(def) {
    if (!this.items.find((i) => i.id === def.id)) this.items.push(def);
    if (this.isOpen) this._render();
  }
  has(id) { return !!this.items.find((i) => i.id === id); }
  remove(id) {
    const i = this.items.findIndex((it) => it.id === id);
    if (i >= 0) this.items.splice(i, 1);
    if (this.isOpen) this._render();
  }

  toggle() { this.isOpen ? this.close() : this.open(); }
  open() { this.isOpen = true; this.el.style.display = 'flex'; this._render(); }
  close() { this.isOpen = false; this.el.style.display = 'none'; }

  _render() {
    this.panel.innerHTML = '';
    const title = document.createElement('div');
    title.style.cssText = 'font-size:1.3rem;letter-spacing:.1em;color:#b03a2e;margin-bottom:14px';
    title.textContent = '소지품';
    this.panel.appendChild(title);

    if (this.items.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'opacity:.6';
      empty.textContent = '— 비어 있음 —';
      this.panel.appendChild(empty);
    } else {
      for (const def of this.items) {
        const row = document.createElement('div');
        row.style.cssText = 'padding:12px 10px;border-bottom:1px solid #2a221a;cursor:pointer;font-size:1.15rem;color:#e8d8b0';
        row.textContent = '· ' + def.name;
        row.addEventListener('mouseenter', () => { row.style.background = 'rgba(80,60,40,0.28)'; });
        row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
        row.addEventListener('click', () => this.onInspect(def));
        this.panel.appendChild(row);
      }
    }
    const hint = document.createElement('div');
    hint.style.cssText = 'margin-top:16px;opacity:.5;font-size:.8rem';
    hint.textContent = '[I] 닫기 · 항목 클릭 → 자세히 보기';
    this.panel.appendChild(hint);
  }
}
