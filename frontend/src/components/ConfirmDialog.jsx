import Modal from './Modal'

export default function ConfirmDialog({ open, onClose, onConfirm, title = 'Confirm Delete', message = 'Are you sure you want to delete this record? This action cannot be undone.' }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>{message}</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger" onClick={() => { onConfirm(); onClose() }}>Delete</button>
      </div>
    </Modal>
  )
}
