/**
 * Selector Engine - Enhanced with Shadow DOM support and better compatibility
 * Priority: ID > name > linkText > data-testid > className > CSS > XPath > partialLink
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
      testId: null,
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
      selectors.name = `${element.tagName.toLowerCase()}[name="${CSS.escape(element.name)}"]`;
    }

    // Level 3: Link text (exact match for <a> tags)
    if (element.tagName === 'A' && element.textContent) {
      selectors.linkText = element.textContent.trim();
    }

    // Level 3.5: data-testid (very common in modern apps)
    const testId = element.getAttribute('data-testid') || 
                   element.getAttribute('data-test-id') ||
                   element.getAttribute('data-test');
    if (testId) {
      selectors.testId = `[data-testid="${CSS.escape(testId)}"]`;
    }

    // Level 4: Class names (first 3 classes, excluding dynamic ones)
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim()
        .split(/\s+/)
        .filter(c => !this.isDynamicClass(c))
        .slice(0, 3);
      
      if (classes.length > 0) {
        selectors.className = element.tagName.toLowerCase() + '.' + 
          classes.map(c => CSS.escape(c)).join('.');
      }
    }

    // Level 5: CSS selector with data attributes and ARIA
    const dataAttrs = Array.from(element.attributes)
      .filter(attr => 
        (attr.name.startsWith('data-') || 
         attr.name.startsWith('aria-') ||
         attr.name === 'role' ||
         attr.name === 'type') && 
        attr.value
      )
      .slice(0, 2);
    
    if (dataAttrs.length > 0) {
      selectors.css = element.tagName.toLowerCase() + 
        dataAttrs.map(attr => `[${attr.name}="${CSS.escape(attr.value)}"]`).join('');
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
   * Check if a class name looks dynamically generated
   */
  static isDynamicClass(className) {
    // Skip classes that look like CSS modules, styled-components, etc.
    return /^[a-z0-9]{8,}$/i.test(className) || // Long random strings
           /_[a-z0-9]{5,}$/i.test(className) ||   // Suffixed hashes
           /^css-/.test(className);                // CSS-in-JS
  }

  /**
   * Find element using fallback chain with Shadow DOM support
   * @param {Object} selectors - Selector metadata from generateSelectors
   * @returns {HTMLElement|null}
   */
  static findElement(selectors) {
    // Try in main document first
    let element = this.findInDocument(document, selectors);
    if (element) return element;

    // Try in Shadow DOMs
    element = this.findInShadowRoots(selectors);
    if (element) return element;

    // Try in iframes
    element = this.findInIframes(selectors);
    if (element) return element;

    return null;
  }

  /**
   * Find element in a specific document/shadow root
   */
  static findInDocument(doc, selectors) {
    // Level 1: ID
    if (selectors.id) {
      try {
        const el = doc.querySelector(selectors.id);
        if (el) return el;
      } catch (e) { /* Invalid selector */ }
    }

    // Level 2: Name
    if (selectors.name) {
      try {
        const el = doc.querySelector(selectors.name);
        if (el) return el;
      } catch (e) { /* Invalid selector */ }
    }

    // Level 3: data-testid
    if (selectors.testId) {
      try {
        const el = doc.querySelector(selectors.testId);
        if (el) return el;
      } catch (e) { /* Invalid selector */ }
    }

    // Level 4: Link text (exact)
    if (selectors.linkText && selectors.tagName === 'a') {
      const links = Array.from(doc.getElementsByTagName('a'));
      const el = links.find(link => 
        link.textContent.trim() === selectors.linkText
      );
      if (el) return el;
    }

    // Level 5: Class name
    if (selectors.className) {
      try {
        const el = doc.querySelector(selectors.className);
        if (el) return el;
      } catch (e) { /* Invalid selector */ }
    }

    // Level 6: CSS selector
    if (selectors.css) {
      try {
        const el = doc.querySelector(selectors.css);
        if (el) return el;
      } catch (e) { /* Invalid selector */ }
    }

    // Level 7: XPath
    if (selectors.xpath) {
      try {
        const result = doc.evaluate(
          selectors.xpath,
          doc,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        if (result.singleNodeValue) return result.singleNodeValue;
      } catch (e) { /* Invalid XPath */ }
    }

    // Level 8: Partial link text
    if (selectors.partialLinkText && selectors.tagName === 'a') {
      const links = Array.from(doc.getElementsByTagName('a'));
      const el = links.find(link => 
        link.textContent.includes(selectors.partialLinkText)
      );
      if (el) return el;
    }

    // Level 9: Text content matching (last resort)
    if (selectors.textContent && selectors.tagName) {
      const elements = Array.from(doc.getElementsByTagName(selectors.tagName));
      const el = elements.find(elem => 
        elem.textContent?.trim().startsWith(selectors.textContent)
      );
      if (el) return el;
    }

    return null;
  }

  /**
   * Find element in Shadow DOM trees
   */
  static findInShadowRoots(selectors) {
    const shadowHosts = this.getAllShadowHosts(document.body);
    
    for (const host of shadowHosts) {
      if (host.shadowRoot) {
        const element = this.findInDocument(host.shadowRoot, selectors);
        if (element) return element;
      }
    }
    
    return null;
  }

  /**
   * Get all elements with Shadow DOM
   */
  static getAllShadowHosts(root) {
    const hosts = [];
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT,
      null,
      false
    );

    let node;
    while (node = walker.nextNode()) {
      if (node.shadowRoot) {
        hosts.push(node);
        // Recursively find shadow hosts in this shadow root
        hosts.push(...this.getAllShadowHosts(node.shadowRoot));
      }
    }

    return hosts;
  }

  /**
   * Find element in iframes
   */
  static findInIframes(selectors) {
    const iframes = document.getElementsByTagName('iframe');
    
    for (const iframe of iframes) {
      try {
        // Skip cross-origin iframes
        if (!iframe.contentDocument) continue;
        
        const element = this.findInDocument(iframe.contentDocument, selectors);
        if (element) return element;
      } catch (e) {
        // Cross-origin or access denied
        continue;
      }
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

  /**
   * Get a human-readable description of how element was found
   */
  static getMatchMethod(element, selectors) {
    if (selectors.id && document.querySelector(selectors.id) === element) {
      return 'ID';
    }
    if (selectors.name && document.querySelector(selectors.name) === element) {
      return 'Name';
    }
    if (selectors.testId && document.querySelector(selectors.testId) === element) {
      return 'TestID';
    }
    if (selectors.linkText) {
      return 'LinkText';
    }
    if (selectors.className && document.querySelector(selectors.className) === element) {
      return 'ClassName';
    }
    if (selectors.css && document.querySelector(selectors.css) === element) {
      return 'CSS';
    }
    return 'XPath/Fallback';
  }
}