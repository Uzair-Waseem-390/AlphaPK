import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';

const ExtendDueDateModal = ({ isOpen, onClose, onSubmit, currentDueDate, loading }) => {
    const [dueDate, setDueDate] = useState(currentDueDate || '');
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setDueDate(currentDueDate || '');
            setError('');
        }
    }, [isOpen, currentDueDate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!dueDate) {
            setError('Please pick a due date.');
            return;
        }
        try {
            await onSubmit(dueDate);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to update due date.');
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Extend Due Date">
            <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                    label="New Due Date"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    required
                />
                {error && <p className="text-sm text-error-600">{error}</p>}
                <div className="flex justify-end gap-3 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" loading={loading}>
                        Save
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

ExtendDueDateModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onSubmit: PropTypes.func.isRequired,
    currentDueDate: PropTypes.string,
    loading: PropTypes.bool,
};

export default ExtendDueDateModal;
