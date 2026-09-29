// Behaviour for the demo forms: React-Select-style comboboxes, Workday-style
// button dropdowns, "Add another" repeaters and a shadow-DOM custom field.
// Shared by the demo pages (served by `npm run demo`) and the integration tests.

function el(doc, tag, attrs = {}, text) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

/** <div class="demo-combo" data-options="A|B|C"> with an input[role=combobox] inside. */
export function installComboboxes(doc) {
  doc.querySelectorAll('.demo-combo').forEach((box, n) => {
    if (box.dataset.ready) return;
    box.dataset.ready = '1';
    const input = box.querySelector('input[role="combobox"]');
    const hidden = box.querySelector('input[type="hidden"]');
    const valueSlot = box.querySelector('.select__value');
    const options = (box.dataset.options || '').split('|').filter(Boolean);
    const listId = `${input.id || `combo-${n}`}-listbox`;
    let menu = null;

    const close = () => {
      menu?.remove();
      menu = null;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-controls');
    };
    const choose = (value) => {
      hidden.value = value;
      valueSlot.textContent = value;
      valueSlot.className = 'select__value select__single-value';
      input.value = '';
      close();
      box.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const open = () => {
      const q = input.value.trim().toLowerCase();
      const shown = options.filter((o) => o.toLowerCase().includes(q));
      if (!menu) {
        menu = el(doc, 'div', { class: 'select__menu', role: 'listbox', id: listId });
        box.appendChild(menu);
      }
      menu.replaceChildren(
        ...shown.map((o) => {
          const opt = el(doc, 'div', { class: 'select__option', role: 'option' }, o);
          opt.addEventListener('click', () => choose(o));
          return opt;
        }),
      );
      if (!shown.length)
        menu.appendChild(el(doc, 'div', { class: 'select__menu-notice' }, 'No options'));
      input.setAttribute('aria-expanded', 'true');
      input.setAttribute('aria-controls', listId);
    };
    input.addEventListener('mousedown', open);
    input.addEventListener('input', open);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
    input.addEventListener('blur', () =>
      setTimeout(() => {
        input.value = '';
        close();
      }, 150),
    );
  });
}

/** Workday-style <button aria-haspopup="listbox" data-options="A|B">Select One</button>. */
export function installButtonDropdowns(doc) {
  doc.querySelectorAll('button.demo-dropdown').forEach((button) => {
    if (button.dataset.ready) return;
    button.dataset.ready = '1';
    const options = (button.dataset.options || '').split('|').filter(Boolean);
    const hidden = button.parentElement.querySelector('input[type="hidden"]');
    button.addEventListener('click', () => {
      doc.querySelectorAll('.demo-popup').forEach((p) => p.remove());
      const list = el(doc, 'ul', { role: 'listbox', class: 'demo-popup' });
      for (const o of options) {
        const li = el(doc, 'li', { role: 'option' });
        li.appendChild(el(doc, 'div', { 'data-automation-id': 'promptOption' }, o));
        li.addEventListener('click', () => {
          button.textContent = o;
          if (hidden) hidden.value = o;
          list.remove();
        });
        list.appendChild(li);
      }
      doc.body.appendChild(list);
    });
  });
}

/** <button class="demo-add" data-template="tpl-id" data-target="container-id">. */
export function installRepeaters(doc) {
  doc.querySelectorAll('button.demo-add').forEach((button) => {
    if (button.dataset.ready) return;
    button.dataset.ready = '1';
    button.addEventListener('click', () => {
      const tpl = doc.getElementById(button.dataset.template);
      const target = doc.getElementById(button.dataset.target);
      const index = target.children.length + 1;
      const clone = tpl.content.cloneNode(true);
      clone.querySelectorAll('*').forEach((node) => {
        for (const attr of Array.from(node.attributes)) {
          if (attr.value.includes('__N__'))
            node.setAttribute(attr.name, attr.value.replace(/__N__/g, String(index)));
        }
      });
      clone.querySelectorAll('.entry-number').forEach((n) => (n.textContent = String(index)));
      target.appendChild(clone);
      installComboboxes(doc);
      installButtonDropdowns(doc);
      if (button.dataset.anotherLabel) button.textContent = button.dataset.anotherLabel;
    });
  });
}

/** <pronoun-field label="Pronouns"> renders an input inside an open shadow root. */
export function installShadowField(doc) {
  const win = doc.defaultView;
  if (!win?.customElements || win.customElements.get('pronoun-field')) return;
  win.customElements.define(
    'pronoun-field',
    class extends win.HTMLElement {
      connectedCallback() {
        if (this.shadowRoot) return;
        const root = this.attachShadow({ mode: 'open' });
        const label = el(
          doc,
          'label',
          { for: 'pronouns' },
          this.getAttribute('label') || 'Pronouns',
        );
        const input = el(doc, 'input', { id: 'pronouns', name: 'pronouns', type: 'text' });
        root.append(label, input);
      }
    },
  );
}

export function installAll(doc = document) {
  installComboboxes(doc);
  installButtonDropdowns(doc);
  installRepeaters(doc);
  installShadowField(doc);
}
