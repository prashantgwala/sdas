import { Schema, model } from 'mongoose';
import { PERMISSIONS, ROLES } from '../config/constants';

const roleSchema = new Schema(
  {
    key: { type: String, enum: ROLES, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, maxlength: 500 },
    permissions: { type: [String], enum: PERMISSIONS, default: [] },
    isSystem: { type: Boolean, default: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const Role = model('Role', roleSchema);

const permissionSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    module: { type: String, required: true, index: true },
    action: { type: String, required: true },
    description: { type: String, maxlength: 300 },
  },
  { timestamps: true },
);

export const Permission = model('Permission', permissionSchema);
