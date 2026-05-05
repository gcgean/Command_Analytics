console.log('Custom Cursor background service worker started');

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed/updated:', details.reason);
  
  if (details.reason === 'install') {
    try {
      const response = await fetch(chrome.runtime.getURL('/libs/collections.json'));
      const collection = await response.json();
      
      const defaultData = {
        domain: "https://custom-cursor.com/",
        collection: collection,
        size: 32,
        counterTab: 1,
        myCollection: {},
        version: chrome.runtime.getManifest().version,
        favorites: [],
        rotator: { status: false, type: "request", value: 60 },
        di: new Date().getTime(),
        uid: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0;
          return (c == 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        })
      };
      
      await chrome.storage.local.set(defaultData);
      console.log('Default data initialized');
      
      chrome.tabs.create({
        url: 'https://custom-cursor.com/successful_installation?utm_source=ext&utm_medium=install&utm_campaign=install_succesful'
      });
      
    } catch (error) {
      console.error('Installation error:', error);
    }
  } else if (details.reason === 'update') {
    await chrome.storage.local.set({
      du: new Date().getTime(),
      size: 32,
      rotator: { status: false, type: "request", value: 60 }
    });
  }
});

chrome.runtime.onStartup.addListener(registerContentScripts);
chrome.runtime.onInstalled.addListener(registerContentScripts);

async function registerContentScripts() {
  try {
    await chrome.scripting.unregisterContentScripts();
    await chrome.scripting.registerContentScripts([{
      id: "cursor",
      js: ["content.js"],
      matches: ["*://*/*"],
      allFrames: true,
      matchOriginAsFallback: true,
      runAt: "document_start",
      world: "ISOLATED"
    }]);
    console.log('Content scripts registered');
  } catch (error) {
    console.error('Content script registration error:', error);
  }
}

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  console.log('External message received:', request);
  
  chrome.storage.local.get(null, (data) => {
    if (chrome.runtime.lastError) {
      sendResponse({ error: chrome.runtime.lastError.message });
      return;
    }
    
    switch (request.action) {
      case 'getInstalled':
      case 'get_config':
        sendResponse(data);
        break;
        
      case 'install_collection':
        if (!data.collection) data.collection = {};
        data.collection[request.slug] = request.collection;
        chrome.storage.local.set({ collection: data.collection }, () => {
          sendResponse({ status: true, action: 'install_collection' });
        });
        return true;
        
      case 'set_config':
        if (request.data.selected) {
          const pack = request.data.selected;
          const size = data.size || 32;
          
          if (pack.cursor?.image && !pack.cursor.originalPath) {
            pack.cursor.originalPath = pack.cursor.image;
          }
          if (pack.pointer?.image && !pack.pointer.originalPath) {
            pack.pointer.originalPath = pack.pointer.image;
          }
          
          processCursorPack(pack, size).then(processedPack => {
            chrome.storage.local.set({ selected: processedPack, ...request.data }, () => {
              sendResponse({ status: true, action: 'set_config' });
            });
          }).catch(error => {
            console.error('Pack processing error:', error);
            chrome.storage.local.set(request.data, () => {
              sendResponse({ status: true, action: 'set_config' });
            });
          });
          return true;
        } else {
          chrome.storage.local.set(request.data, () => {
            sendResponse({ status: true, action: 'set_config' });
          });
          return true;
        }
        
      default:
        sendResponse({ error: 'Unknown action' });
    }
  });
  
  return true;
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Internal message received:', request);
  
  switch (request.action) {
    case 'startRotator':
    case 'startRotation':
      startRotator().then(() => sendResponse({})).catch(err => sendResponse({ error: err.message }));
      return true;
      
    case 'stopRotator':
    case 'stopRotation':
      chrome.alarms.clear('rotationTime', () => sendResponse({}));
      return true;
      
    case 'getOffset':
      sendResponse({ getOffset: false });
      break;
      
    default:
      sendResponse({ error: 'Unknown action' });
  }
  
  return true;
});

async function startRotator() {
  const data = await chrome.storage.local.get(['rotator']);
  if (data.rotator && data.rotator.status && data.rotator.type === 'time') {
    chrome.alarms.create('rotationTime', {
      periodInMinutes: data.rotator.value / 60
    });
  }
}

chrome.tabs.onCreated.addListener(handleTabChange);
chrome.tabs.onUpdated.addListener(handleTabChange);

function handleTabChange(tabId, changeInfo, tab) {
  if (changeInfo && changeInfo.status === 'complete' && tab && tab.status === 'complete') {
    chrome.storage.local.get(['counterTab', 'rotator'], (data) => {
      if (data.rotator && data.rotator.status && data.rotator.type === 'request') {
        let counter = parseInt(data.counterTab) || 0;
        if (data.rotator.value > counter) {
          chrome.storage.local.set({ counterTab: counter + 1 });
        } else {
          rotateCursor();
          chrome.storage.local.set({ counterTab: 0 });
        }
      }
    });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  console.log('Alarm triggered:', alarm.name);
  
  switch (alarm.name) {
    case 'rotationTime':
      rotateCursor();
      break;
      
    case 'checkNotification':
      chrome.storage.local.get(['uid'], (data) => {
        if (data.uid) {
          fetch(`https://custom-cursor.com/api/notification/custom-cursor-helper/${data.uid}`, {
            method: 'POST',
            mode: 'no-cors'
          }).then(response => response.json()).catch(() => {});
        }
      });
      break;
      
    case 'showNotification':
      chrome.notifications.create('cursor-notification', {
        type: 'basic',
        iconUrl: 'assets/icons/icon128.png',
        title: 'Custom Cursor',
        message: 'New cursor pack available!',
        priority: 2
      });
      break;
  }
});

chrome.alarms.create('noSleep', { periodInMinutes: 1 });

Array.prototype.cycle = function(value) {
  if (!this || this.length === 0) return null;
  const index = this.indexOf(value);
  if (index === -1) {
    return this[0];
  }
  return this[(index + 1) % this.length];
};

async function rotateCursor() {
  try {
    const data = await chrome.storage.local.get(['favorites', 'selected', 'collection', 'size']);
    console.log('Rotate cursor - data:', { 
      favorites: data.favorites, 
      selectedId: data.selected?.id,
      collections: Object.keys(data.collection || {})
    });
    
    if (!data.favorites || data.favorites.length === 0) {
      console.log('No favorites to rotate');
      return;
    }
    
    const currentId = data.selected?.id || null;
    const nextPackId = data.favorites.cycle(currentId);
    console.log('Current ID:', currentId, 'Next pack ID:', nextPackId);
    
    if (!nextPackId) {
      console.log('No next pack found');
      return;
    }
    
    let foundPack = null;
    for (const collectionId in data.collection) {
      const collection = data.collection[collectionId];
      
      let items = collection.items;
      if (items) {
        if (!Array.isArray(items)) {
          items = Object.values(items);
        }
        
        const pack = items.find(item => item && item.id === nextPackId);
        if (pack) {
          console.log('Found pack in collection:', collectionId, pack);
          foundPack = { ...pack };
          break;
        }
      }
    }
    
    if (!foundPack) {
      console.log('Pack not found in any collection');
      return;
    }
    
    if (!foundPack.cursor) foundPack.cursor = {};
    if (!foundPack.pointer) foundPack.pointer = {};
    
    if (foundPack.cursor.path && !foundPack.cursor.originalPath) {
      foundPack.cursor.originalPath = foundPack.cursor.path;
    }
    if (foundPack.pointer.path && !foundPack.pointer.originalPath) {
      foundPack.pointer.originalPath = foundPack.pointer.path;
    }
    
    const processedPack = await processCursorPack(foundPack, data.size || 32);
    console.log('Processed pack:', processedPack);
    
    await chrome.storage.local.set({ selected: processedPack });
    
    const tabs = await chrome.tabs.query({});
    console.log('Notifying tabs:', tabs.length);
    
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'changeCursorPack' });
      } catch (e) {
        console.log('Could not notify tab:', tab.id, e.message);
      }
    }
    
    console.log('Cursor rotation complete');
  } catch (error) {
    console.error('Rotate cursor error:', error);
  }
}

async function processCursorPack(pack, size) {
  const processed = { ...pack };
  
  if (pack.cursor?.path && !pack.cursor.originalPath) {
    processed.cursor.originalPath = pack.cursor.path;
  }
  if (pack.pointer?.path && !pack.pointer.originalPath) {
    processed.pointer.originalPath = pack.pointer.path;
  }
  
  if (pack.cursor?.originalPath) {
    processed.cursor.path = await resizeImage(pack.cursor.originalPath, size);
  }
  if (pack.pointer?.originalPath) {
    processed.pointer.path = await resizeImage(pack.pointer.originalPath, size);
  }
  
  const scale = 128 / size;
  if (pack.cursor) {
    processed.cursor.offsetSizeX = Math.floor((pack.cursor.offsetX || 0) / scale);
    processed.cursor.offsetSizeY = Math.floor((pack.cursor.offsetY || 0) / scale);
  }
  if (pack.pointer) {
    processed.pointer.offsetSizeX = Math.floor((pack.pointer.offsetX || 0) / scale);
    processed.pointer.offsetSizeY = Math.floor((pack.pointer.offsetY || 0) / scale);
  }
  
  return processed;
}

async function resizeImage(url, size) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);
    
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageBitmap, 0, 0, size, size);
    
    const resizedBlob = await canvas.convertToBlob();
    
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(resizedBlob);
    });
  } catch (error) {
    console.error('Image resize error:', error);
    return url;
  }
}

chrome.runtime.setUninstallURL('https://custom-cursor.com/uninstall?utm_source=ext&utm_medium=uninstall&utm_campaign=uninstall');

console.log('Background service worker initialized');
