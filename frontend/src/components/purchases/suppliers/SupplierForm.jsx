import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Input from '../../common/Input';
import Button from '../../common/Button';

const SupplierForm = ({ initialData, onSubmit, onCancel, loading }) => {
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        address: '',
        mobile: '',
    });

    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (initialData) {
            setFormData({
                name: initialData.name || '',
                code: initialData.code || '',
                address: initialData.address || '',
                mobile: initialData.mobile || '',
            });
        }
    }, [initialData]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    const validate = () => {
        const newErrors = {};
        if (!formData.name) newErrors.name = 'Name is required';
        if (!formData.code) newErrors.code = 'Code is required';
        if (!formData.address) newErrors.address = 'Address is required';
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (validate()) {
            onSubmit(formData);
        }
    };

    return (
        <motion.form
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onSubmit={handleSubmit}
            className="space-y-4"
        >
            <Input
                label="Name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Supplier Name"
                error={errors.name}
                required
            />

            <Input
                label="Code"
                name="code"
                value={formData.code}
                onChange={handleChange}
                placeholder="SUP-001"
                error={errors.code}
                required
            />

            <Input
                label="Address"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="Street, City, Country"
                error={errors.address}
                required
            />

            <Input
                label="Mobile"
                name="mobile"
                value={formData.mobile}
                onChange={handleChange}
                placeholder="+92 300 1234567"
                error={errors.mobile}
            />

            <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="secondary" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="submit" loading={loading}>
                    {initialData ? 'Update Supplier' : 'Create Supplier'}
                </Button>
            </div>
        </motion.form>
    );
};

export default SupplierForm;