import { PhotoTag, PhotoThumb, newFirst } from './Bookshelf.jsx';
import Icon from './Icon.jsx';

// Shown when adding a drawing while there are photos in My Photos: use one of
// those (new ones first), or take or choose another on this device.
export default function PhotoPicker({ photos, onPick, onDevice, onCancel }) {
  return (
    <div className="gn-modal" role="dialog" aria-modal="true" aria-label="Pick a photo">
      <div className="gn-modal-card gn-picker">
        <div className="gn-modal-head">
          <h2 className="gn-h2">Pick a Photo</h2>
          <button className="gn-btn" onClick={onCancel}><Icon name="close" /> Cancel</button>
        </div>
        <div className="gn-tray-grid">
          {newFirst(photos).map((photo, i) => (
            <button key={photo.id} className="gn-tray-item gn-tray-pick"
              aria-label={`${photo.usedAt ? 'Used photo' : 'New photo'} ${i + 1}`} onClick={() => onPick(photo)}>
              <PhotoThumb imageId={photo.imageId} />
              <PhotoTag photo={photo} />
            </button>
          ))}
        </div>
        <button className="gn-btn gn-btn-yellow" onClick={onDevice}>
          <Icon name="camera" /> Take or Choose Another Photo
        </button>
      </div>
    </div>
  );
}
