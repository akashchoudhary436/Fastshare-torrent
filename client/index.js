// Define WebRTC configuration function
const getRtcConfig = (cb) => {
  // Hardcoded WebRTC configuration
  const rtcConfig = {
    iceServers: [
      // STUN Servers
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      { urls: 'stun:stun.services.mozilla.com' },
      { urls: 'stun:stun.ekiga.net' },

      // TURN Servers (no authentication)
      { urls: 'turn:turn.anyfirewall.com:443?transport=udp' },
      { urls: 'turn:turn.anyfirewall.com:443?transport=tcp' }
    ],
    sdpSemantics: 'unified-plan',
    bundlePolicy: 'max-bundle',
    iceCandidatePoolSize: 10
  };
  
  cb(null, rtcConfig);
};

// Import necessary modules and libraries
const createTorrent = require('create-torrent');
const dragDrop = require('drag-drop');
const escapeHtml = require('escape-html');
const get = require('simple-get');
const formatDistance = require('date-fns/formatDistance');
const path = require('path');
const prettierBytes = require('prettier-bytes');
const throttle = require('throttleit');
const thunky = require('thunky');
const uploadElement = require('upload-element');
const WebTorrent = require('webtorrent');
const JSZip = require('jszip');
const SimplePeer = require('simple-peer');
const util = require('./util');
const debug = require('debug');


// Define your custom torrent tracker
const customTracker = 'wss://torrent-tracker.onrender.com';

// Extract global trackers from `createTorrent.announceList`
const globalTrackers = createTorrent.announceList
  .map(arr => arr[0])  // Extract URLs from the announce list
  .filter(url => url.startsWith('wss://') || url.startsWith('ws://'));  // Filter for WebSocket URLs

// Set the `WEBTORRENT_ANNOUNCE` array to use the custom tracker first, then the global trackers
globalThis.WEBTORRENT_ANNOUNCE = [customTracker, ...globalTrackers];


// Create WebTorrent client
const getClient = thunky(function (cb) {
  getRtcConfig(function (err, rtcConfig) {
    if (err) util.error(err);
    const client = new WebTorrent({
      tracker: {
        rtcConfig: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
          ],
          sdpSemantics: 'unified-plan',
          bundlePolicy: 'max-bundle',
          iceCandidatePoolSize: 20,
        }
      },
      dht: true, // Enable DHT for better peer discovery
      utp: true, // Enable uTP for efficient bandwidth usage
      maxConnections: 200, // Increase connections limit
      uploads: {
        maxUploadSpeed: 0, // Unlimited upload speed
        maxDownloadSpeed: 0 // Unlimited download speed
      }
    });
    window.client = client;
    client.on('warning', util.warning);
    client.on('error', util.error);
    cb(null, client);
  });
});

// Initialize the application
function init() {
  if (!WebTorrent.WEBRTC_SUPPORT) {
    util.error('This browser is unsupported. Please use a browser with WebRTC support.');
  }

  // Create the client immediately
  getClient(() => {});

  // Seed via upload input element
  const upload = document.querySelector('input[name=upload]');
  if (upload) {
    uploadElement(upload, (err, files) => {
      if (err) return util.error(err);
      files = files.map(file => file.file);
      onFiles(files);
    });
  }

  // Seed via drag-and-drop
  dragDrop('body', onFiles);

  // Download via input element
  const form = document.querySelector('form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      downloadTorrent(document.querySelector('form input[name=torrentId]').value.trim());
    });
  }

  // Download by URL hash
  onHashChange();
  window.addEventListener('hashchange', onHashChange);

  function onHashChange() {
    const hash = decodeURIComponent(window.location.hash.substring(1)).trim();
    if (hash !== '') downloadTorrent(hash);
  }

  // Register a protocol handler for "magnet:" (will prompt the user)
  if ('registerProtocolHandler' in navigator) {
    navigator.registerProtocolHandler('magnet', window.location.origin + '#%s', 'FastShare');
  }

  // Register a service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
}

// Handle files
function onFiles(files) {
  debug('got files:');
  files.forEach(file => {
    debug(' - %s (%s bytes)', file.name, file.size);
  });

  // .torrent file = start downloading the torrent
  files.filter(isTorrentFile).forEach(downloadTorrentFile);

  // everything else = seed these files
  seed(files.filter(isNotTorrentFile));
}

// Check if file is a torrent file
function isTorrentFile(file) {
  const extname = path.extname(file.name).toLowerCase();
  return extname === '.torrent';
}

// Check if file is not a torrent file
function isNotTorrentFile(file) {
  return !isTorrentFile(file);
}

// Download a torrent by ID
function downloadTorrent(torrentId) {
  util.log('Downloading torrent from ' + torrentId);
  getClient((err, client) => {
    if (err) return util.error(err);
    client.add(torrentId, onTorrent);
  });
}


// Download a torrent file
function downloadTorrentFile(file) {
  util.unsafeLog('Downloading torrent from <strong>' + escapeHtml(file.name) + '</strong>');
  getClient((err, client) => {
    if (err) return util.error(err);
    client.add(file, onTorrent);
  });
}

// Seed files
function seed(files) {
  if (files.length === 0) return;


  // Seed from WebTorrent
  getClient((err, client) => {
    if (err) return util.error(err);
    client.seed(files, onTorrent);
  });
}
// Inject CSS styles into the document
// Inject CSS styles into the document
const style = document.createElement('style');
style.textContent = `
  /* Container for torrent information */
  .torrent-info-container {
    margin: 20px 0;
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 5px;
    background-color: #f9f9f9;
  }

  /* Style for the torrent info text */
  .torrent-info {
    font-size: 16px;
    margin-bottom: 10px;
    display: inline-block;
  }

  /* Style for the info hash container */
  .info-hash-container {
    display: flex;
    align-items: center;
    margin-top: 10px;
  }

  /* Style for the info hash box */
  .info-hash-box {
    padding: 10px;
    font-family: monospace;
    background-color: #e0e0e0;
    border: 1px solid #ddd;
    border-radius: 3px;
    cursor: pointer;
    user-select: none; /* Prevent text selection */
    margin-left: 10px;
  }

  /* Hover effect for info hash box */
  .info-hash-box:hover {
    background-color: #d0d0d0;
  }

  /* Style for the share link */
  .share-link {
    margin-top: 10px;
    font-size: 18px; /* Increase font size */
    font-weight: bold; /* Make text bold */
  }

  .share-link a {
    color: #007bff; /* Blue color for the link */
    text-decoration: none; /* Remove underline */
  }

  .share-link a:hover {
    text-decoration: underline; /* Underline on hover */
  }

  /* Container for file download links with a fixed size and scrollbar */
  .file-links-container {
    margin-top: 20px;
    max-height: 200px; /* Adjust height as needed */
    overflow-y: auto; /* Add vertical scrollbar if content overflows */
    border: 1px solid #ccc;
    border-radius: 5px;
    padding: 10px;
    background-color: #f9f9f9;
  }

  /* Style for file download links */
  .file-link {
    display: block;
    margin-bottom: 5px;
    color: #007bff;
    text-decoration: none;
  }

  .file-link:hover {
    text-decoration: underline;
  }

  /* Style for the single-line speed information */
  .speed-info {
    font-size: 14px;
    white-space: nowrap; /* Ensure single line display */
    overflow: hidden;
    text-overflow: ellipsis; /* Add ellipsis for overflow */
  }
`;
document.head.appendChild(style);

// Handle torrent events
function onTorrent(torrent) {
  torrent.on('warning', util.warning);
  torrent.on('error', util.error);

  const upload = document.querySelector('input[name=upload]');
  if (upload) upload.value = upload.defaultValue; // Reset upload element

  // Create or update the torrent info container
  let torrentInfoContainer = document.querySelector('.torrent-info-container');
  if (!torrentInfoContainer) {
    torrentInfoContainer = document.createElement('div');
    torrentInfoContainer.className = 'torrent-info-container';
    util.appendElemToLog(torrentInfoContainer);
  } else {
    torrentInfoContainer.innerHTML = ''; // Clear previous content
  }

  // Calculate total size of all files in the torrent
  const totalSize = torrent.files.reduce((sum, file) => sum + file.length, 0);

  // Create and append elements to the torrent info container
  const totalSizeElement = document.createElement('p');
  totalSizeElement.className = 'torrent-info';
  totalSizeElement.innerHTML = `<strong>${torrent.files.length} files with a total size of ${prettierBytes(totalSize)}</strong>`;
  
  const infoHashElement = document.createElement('div');
  infoHashElement.className = 'info-hash-container';

  const infoHashBox = document.createElement('div');
  infoHashBox.className = 'info-hash-box';
  infoHashBox.textContent = torrent.infoHash;
  infoHashBox.addEventListener('click', () => {
    navigator.clipboard.writeText(torrent.infoHash)
      .then(() => {
        // Show a temporary message to indicate successful copy
        const copiedMessage = document.createElement('div');
        copiedMessage.textContent = 'Copied!';
        copiedMessage.style.position = 'absolute';
        copiedMessage.style.backgroundColor = '#4caf50';
        copiedMessage.style.color = '#fff';
        copiedMessage.style.padding = '5px';
        copiedMessage.style.borderRadius = '3px';
        copiedMessage.style.zIndex = '1000';
        copiedMessage.style.top = '10px';
        copiedMessage.style.right = '10px';
        document.body.appendChild(copiedMessage);
        setTimeout(() => {
          document.body.removeChild(copiedMessage);
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
      });
  });

  infoHashElement.appendChild(infoHashBox);
  torrentInfoContainer.appendChild(totalSizeElement);
  torrentInfoContainer.appendChild(infoHashElement);

  const shareLinkElement = document.createElement('p');
  shareLinkElement.className = 'share-link';

  const shareLink = document.createElement('a');
  shareLink.href = `/#${escapeHtml(torrent.infoHash)}`;
  shareLink.textContent = '[Share link]';
  shareLink.style.cursor = 'pointer';
  shareLink.addEventListener('click', (event) => {
    event.preventDefault();
    navigator.clipboard.writeText(shareLink.href)
      .then(() => {
        // Show a temporary message to indicate successful copy
        const copiedMessage = document.createElement('div');
        copiedMessage.textContent = 'Share link copied!';
        copiedMessage.style.position = 'absolute';
        copiedMessage.style.backgroundColor = '#4caf50';
        copiedMessage.style.color = '#fff';
        copiedMessage.style.padding = '5px';
        copiedMessage.style.borderRadius = '3px';
        copiedMessage.style.zIndex = '1000';
        copiedMessage.style.top = '10px';
        copiedMessage.style.right = '10px';
        document.body.appendChild(copiedMessage);
        setTimeout(() => {
          document.body.removeChild(copiedMessage);
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
      });
  });

  shareLinkElement.appendChild(shareLink);
  torrentInfoContainer.appendChild(shareLinkElement);

  // Create or update the file links container
  let fileLinksContainer = document.querySelector('.file-links-container');
  if (!fileLinksContainer) {
    fileLinksContainer = document.createElement('div');
    fileLinksContainer.className = 'file-links-container';
    util.appendElemToLog(fileLinksContainer);
  } else {
    fileLinksContainer.innerHTML = ''; // Clear previous content
  }

  // Append individual file download links
  torrent.files.forEach(file => {
    file.getBlobURL((err, url) => {
      if (err) return util.error(err);

      const a = document.createElement('a');
      a.target = '_blank';
      a.download = file.name;
      a.href = url;
      a.textContent = `Download ${file.name}`;
      a.className = 'file-link';
      fileLinksContainer.appendChild(a);
    });
  });

  function updateSpeed() {
    const progress = (100 * torrent.progress).toFixed(1);

    let remaining;
    if (torrent.done) {
      remaining = 'Done.';
    } else {
      remaining = torrent.timeRemaining !== Infinity
        ? formatDistance(torrent.timeRemaining, 0, { includeSeconds: true })
        : 'Infinity years';
      remaining = remaining[0].toUpperCase() + remaining.substring(1) + ' remaining.';
    }

    util.updateSpeed(
      `<div class="speed-info">` +
      `<b>Peers:</b> ${torrent.numPeers} &nbsp;` +
      `<b>Progress:</b> ${progress}% &nbsp;` +
      `<b>Download speed:</b> ${prettierBytes(window.client.downloadSpeed)}/s &nbsp;` +
      `<b>Upload speed:</b> ${prettierBytes(window.client.uploadSpeed)}/s &nbsp;` +
      `<b>ETA:</b> ${remaining}` +
      `</div>`
    );
  }

  torrent.on('download', throttle(updateSpeed, 250));
  torrent.on('upload', throttle(updateSpeed, 250));
  setInterval(updateSpeed, 5000);
  updateSpeed();
}

// Start the application
init();
