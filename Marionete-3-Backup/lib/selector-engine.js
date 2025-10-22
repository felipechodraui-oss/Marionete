/**
 * Selector Engine - 7-level fallback strategy for robust element targeting
 * Priority: ID > name > linkText > className > CSS > XPath > partialLink
 */

class SelectorEngine {
  /**
   * Generate all possible selectors for an element
   * @param {HTMLElement} element 
   * @returns {Object} Selector metadata
   */
  static generateSelectors(element) {
    const selectors = {
      id: null,
      name: null,
      linkText: null,
      className: null,
      css: null,
      xpath: null,
      partialLinkText: null,
      tagName: element.tagName.toLowerCase(),
      textContent: element.textContent?.trim().substring(0, 100) || ''
    };

    // Level 1: ID (highest priority)
    if (element.id) {
      selectors.id = `#${CSS.escape(element.id)}`;
    }

    // Level 2: Name attribute
    if (element.name) {
      selectors.name = `${element.tagName.toLowerCase()}[name="${element.name}"]`;
    }

    // Level 3: Link text (exact match for <a> tags)
    if (element.tagName === 'A' && element.textContent) {
      selectors.linkText = element.textContent.trim();
    }

    // Level 4: Class names (first 3 classes)
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/).slice(0, 3);
      if (classes.length > 0) {
        selectors.className = element.tagName.toLowerCase() + '.' + 
          classes.map(c => CSS.escape(c)).join('.');
      }
    }

    // Level 5: CSS selector with data attributes
    const dataAttrs = Array.from(element.attributes)
      .filter(attr => attr.name.startsWith('data-') && attr.value)
      .slice(0, 2);
    
    if (dataAttrs.length > 0) {
      selectors.css = element.tagName.toLowerCase() + 
        dataAttrs.map(attr => `[${attr.name}="${attr.value}"]`).join('');
    } else if (selectors.className) {
      selectors.css = selectors.className;
    }

    // Level 6: Full XPath
    selectors.xpath = this.getXPath(element);

    // Level 7: Partial link text
    if (element.tagName === 'A' && element.textContent) {
      const text = element.textContent.trim();
      selectors.partialLinkText = text.substring(0, Math.min(20, text.length));
    }

    return selectors;
  }

  /**
   * Find element using fallback chain
   * @param {Object} selectors - Selector metadata from generateSelectors
   * @returns {HTMLElement|null}
   */
  static findElement(selectors) {
    // Level 1: ID
    if (selectors.id) {
      try {
        const el = document.querySelector(selectors.id);
        if (el) return el;
      } catch (e) { /* Invalid selector */ }
    }

    // Level 2: Name
    if (selectors.name) {
      try {
        const el = document.querySelector(selectors.name);
        if (el) return el;
      } catch (e) { /* Invalid selector */ }
    }

    // Level 3: Link text (exact)
    if (selectors.linkText && selectors.tagName === 'a') {
      const links = Array.from(document.getElementsByTagName('a'));
      const el = links.find(link => 
        link.textContent.trim() === selectors.linkText
      );
      if (el) return el;
    }

    // Level 4: Class name
    if (selectors.className) {
      try {
        const el = document.querySelector(selectors.className);
        if (el) return el;
      } catch (e) { /* Invalid selector */ }
    }

    // Level 5: CSS selector
    if (selectors.css) {
      try {
        const el = document.querySelector(selectors.css);
        if (el) return el;
      } catch (e) { /* Invalid selector */ }
    }

    // Level 6: XPath
    if (selectors.xpath) {
      try {
        const result = document.evaluate(
          selectors.xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        if (result.singleNodeValue) return result.singleNodeValue;
      } catch (e) { /* Invalid XPath */ }
    }

    // Level 7: Partial link text
    if (selectors.partialLinkText && selectors.tagName === 'a') {
      const links = Array.from(document.getElementsByTagName('a'));
      const el = links.find(link => 
        link.textContent.includes(selectors.partialLinkText)
      );
      if (el) return el;
    }

    // Final fallback: text content matching
    if (selectors.textContent && selectors.tagName) {
      const elements = Array.from(document.getElementsByTagName(selectors.tagName));
      const el = elements.find(elem => 
        elem.textContent?.trim().startsWith(selectors.textContent)
      );
      if (el) return el;
    }

    return null;
  }

  /**
   * Generate XPath for element
   * @param {HTMLElement} element 
   * @returns {string}
   */
  static getXPath(element) {
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }

    if (element === document.body) {
      return '/html/body';
    }

    let path = '';
    let current = element;

    while (current && current !== document.body) {
      let index = 1;
      let sibling = current.previousElementSibling;
      
      while (sibling) {
        if (sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousElementSibling;
      }

      const tagName = current.tagName.toLowerCase();
      path = `/${tagName}[${index}]${path}`;
      current = current.parentElement;
    }

    return `/html/body${path}`;
  }
}