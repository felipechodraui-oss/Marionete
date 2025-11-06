# Marionete Extension - Critical Fixes

## 🔧 Issues Fixed

### 1. **Recording State Lost After Page Navigation** ✅
**Problem**: When a page redirected or navigated during recording, the extension would forget it was recording and lose all captured actions.

**Solution**:
- Added **state persistence** in the background service worker
- Automatic **re-injection** of content scripts after navigation
- **Periodic syncing** of actions to background (every 2 seconds)
- **State restoration** mechanism that recovers recording after page loads

### 2. **Inconsistent Behavior Across Websites** ✅
**Problem**: Extension didn't work reliably on different sites (SPAs, Shadow DOM, iframes, etc.)

**Solution**:
- Enhanced **Shadow DOM support** - finds elements inside web components
- Better **SPA detection** - intercepts history.pushState/replaceState
- **Multiple navigation tracking** methods (MutationObserver + polling + history API)
- Smarter **element selection** - ignores dynamic CSS classes, uses data-testid
- **iframe support** - attempts to find elements in embedded frames
- Better **event capturing** - uses capture phase for more reliable event handling

---

## 📦 Installation Instructions

### Step 1: Replace Files

Copy these **3 fixed files** to your extension directory:

1. **`background/service-worker.js`** - Handles state persistence
2. **`content/recorder.js`** - Enhanced recording with sync
3. **`content/injector.js`** - State restoration after navigation
4. **`lib/selector-engine.js`** - Better element finding (optional but recommended)

### Step 2: Reload Extension

1. Open Chrome: `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Find **Marionete** extension
4. Click **Reload** button (🔄)

### Step 3: Test the Fixes

---

## 🧪 Testing Guide

### Test 1: Navigation During Recording

**Scenario**: Recording should survive page navigation

1. Open any website (e.g., `https://example.com`)
2. Click **Start Recording** in Marionete popup
3. Verify recording indicator appears (red badge in top-right)
4. Click a link that navigates to another page
5. **VERIFY**: Recording indicator should reappear after page loads
6. Perform more actions on the new page
7. Click **Stop Recording**
8. **VERIFY**: All actions from both pages should be saved

**Expected Result**: ✅ Recording persists across navigation, all actions captured

---

### Test 2: Single Page Application (SPA)

**Scenario**: Test on apps that change URL without full page reload

**Test Sites**:
- Twitter/X: `https://x.com`
- GitHub: `https://github.com`
- YouTube: `https://youtube.com`

1. Start recording on the homepage
2. Navigate using the site's internal links (changes URL but no full reload)
3. Perform actions (clicks, inputs)
4. Stop recording
5. **VERIFY**: Navigation actions captured, no actions lost

**Expected Result**: ✅ SPAs work correctly, URL changes tracked

---

### Test 3: Shadow DOM Websites

**Scenario**: Test on sites using Web Components

**Test Sites** (commonly use Shadow DOM):
- Salesforce: `https://salesforce.com`
- Polymer Project: `https://polymer-project.org`
- Shopify Admin (if you have access)

1. Start recording
2. Try clicking elements inside web components
3. Stop recording
4. **VERIFY**: Elements in Shadow DOM are captured

**Expected Result**: ✅ Shadow DOM elements work

---

### Test 4: Multiple Tabs/Windows

**Scenario**: Test state isolation

1. Open Tab A, start recording
2. Open Tab B, start another recording
3. Navigate in Tab A
4. **VERIFY**: Tab A recording continues
5. **VERIFY**: Tab B recording is independent
6. Stop both recordings
7. **VERIFY**: Each has correct actions

**Expected Result**: ✅ Independent recording per tab

---

### Test 5: Complex Website Test

**Recommended test site**: `https://amazon.com` or `https://ebay.com`

1. Start recording
2. Search for a product
3. Click through to product page (navigation)
4. Scroll and click "Add to Cart" or similar
5. Navigate to cart
6. Stop recording
7. **VERIFY**: All steps captured correctly

**Expected Result**: ✅ Complex multi-page flows work

---

## 🐛 Debug Console Commands

If you encounter issues, check browser console:

### In Page Console (F12):
```javascript
// Check if content script is injected
window.__MARIONETE_INJECTED__

// Get recording state
chrome.runtime.sendMessage({type: 'GET_RECORDING_STATE'}, console.log)
```

### In Background Service Worker Console:
1. Go to `chrome://extensions/`
2. Click "Service Worker" under Marionete
3. Check logs for state sync messages

**Expected logs during recording**:
```
[Marionete BG] Recording started, state saved
[Marionete BG] Synced X new actions. Total: Y
[Marionete BG] Page loaded, re-injecting content script...
[Marionete BG] Recording state restored successfully
```

---

## 🔍 Common Issues & Solutions

### Issue: "Recording indicator disappears after navigation"

**Check**:
1. Console shows `[Marionete BG] Page loaded, re-injecting content script...`
2. If not, background worker might have stopped - reload extension

**Fix**: Reload extension and try again

---

### Issue: "Actions from second page not saved"

**Check**:
1. Console shows sync messages: `[Marionete] Synced to background. Total: X`
2. Background state has actions: (use debug command above)

**Fix**: May be CSP blocking. Try a different site first to verify fix works.

---

### Issue: "Can't click elements on certain sites"

**Check**:
1. Console shows: `[Marionete] Captured click` messages
2. Check if element is in Shadow DOM: `$0.shadowRoot` in console (after inspecting element)

**Fix**: 
- Make sure you copied `lib/selector-engine.js`
- Some sites block extensions via strict CSP - these can't be fixed without site cooperation

---

### Issue: "Recording stops when tab loses focus"

**Expected Behavior**: Recording should continue in background tabs

**Check**: Console for `[Marionete] Synced to background` when you return to tab

**Fix**: This should work now. If not, check if browser is suspending tabs (check chrome://discards/)

---

## 📊 How The Fix Works

### Architecture Before:
```
Page Load → Inject Scripts → Start Recording
     ↓
Navigation occurs
     ↓
Scripts destroyed ❌ → Recording lost ❌
```

### Architecture After:
```
Page Load → Inject Scripts → Start Recording
     ↓
Recording state → Background Worker (persistent)
     ↓
Actions synced every 2 seconds ✅
     ↓
Navigation occurs
     ↓
Background detects → Re-inject scripts
     ↓
Restore state → Continue recording ✅
```

---

## 🎯 Key Improvements

1. **State Persistence**: Recording state stored in service worker (survives navigation)
2. **Periodic Sync**: Actions backed up every 2 seconds
3. **Auto Recovery**: Scripts re-injected and state restored on page load
4. **Multiple Tracking**: Navigation detected via 4 methods:
   - MutationObserver
   - History API interception
   - URL polling
   - popstate events
5. **Shadow DOM**: Elements found across shadow boundaries
6. **Better Selectors**: Ignores dynamic classes, uses data-testid
7. **Iframe Support**: Attempts cross-frame element finding

---

## 🚀 Next Steps

After confirming these fixes work:

1. ✅ Test on 5+ different websites
2. ✅ Test navigation scenarios
3. ✅ Test SPA sites
4. 📝 Document any remaining issues
5. 🔧 We can add more features (scroll, copy/paste, etc.)

---

## 📞 Support

If you encounter issues:

1. **Check browser console** for error messages
2. **Check background worker console** for state sync logs
3. **Try a simple test site** first (e.g., example.com)
4. **Note the specific site** where issues occur
5. Share console logs for debugging

---

## ✅ Success Indicators

You'll know it's working when:

- ✅ Recording indicator reappears after navigation
- ✅ Console shows "Recording state restored successfully"
- ✅ Final action count includes steps from all pages
- ✅ Works on different types of websites
- ✅ No actions lost during navigation

---

**Version**: 1.1.0 (Critical Fixes)
**Date**: 2025-06-11
