import { Schema, model } from 'mongoose';

const departmentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 500 },
    head: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    contactEmail: { type: String, lowercase: true, trim: true },
    contactPhone: { type: String, trim: true },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);
export const Department = model('Department', departmentSchema);

const administrativeUnitSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: { type: String, enum: ['TEHSIL', 'BLOCK', 'WARD', 'VILLAGE'], default: 'TEHSIL' },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);
export const AdministrativeUnit = model('AdministrativeUnit', administrativeUnitSchema);

const officeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    department: { type: Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    tehsil: { type: Schema.Types.ObjectId, ref: 'AdministrativeUnit', default: null, index: true },
    address: { type: String, trim: true, maxlength: 500 },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);
officeSchema.index({ department: 1, active: 1 });
export const Office = model('Office', officeSchema);

const districtConfigSchema = new Schema(
  {
    key: { type: String, default: 'default', unique: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    code: { type: String, trim: true, maxlength: 40 },
    address: { type: String, trim: true, maxlength: 500 },
    contactEmail: { type: String, lowercase: true, trim: true },
    contactPhone: { type: String, trim: true },
    logoDocument: { type: Schema.Types.ObjectId, ref: 'Document' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    workingDays: { type: [String], default: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] },
    holidays: { type: [Date], default: [] },
    locale: { type: String, enum: ['en', 'hi'], default: 'en' },
  },
  { timestamps: true },
);
export const DistrictConfig = model('DistrictConfig', districtConfigSchema);
