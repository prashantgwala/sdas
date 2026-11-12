import type { Request } from 'express';
import { GrievanceCategory } from '../models/grievance';
import { AdministrativeUnit, Department, Office } from '../models/org';
import { FileCategory } from '../models/file';
import { ApplicationType } from '../models/application';
import { User } from '../models/user';
import { ROLE_LABELS } from '../config/constants';
import { getSetting } from './setting.service';

export async function getCatalogs() {
  const [categories, departments, units, offices, fileCategories, applicationTypes, platformName, supportEmail, supportPhone] =
    await Promise.all([
      GrievanceCategory.find({ active: true })
        .select('name code parent defaultDepartment defaultPriority requiredEvidence')
        .sort({ name: 1 })
        .lean(),
      Department.find({ active: true }).select('name code description contactEmail contactPhone').sort({ name: 1 }).lean(),
      AdministrativeUnit.find({ active: true }).select('name code type').sort({ name: 1 }).lean(),
      Office.find({ active: true }).select('name code department tehsil address').sort({ name: 1 }).lean(),
      FileCategory.find({ active: true })
        .select('name code defaultDepartment defaultConfidentiality')
        .sort({ name: 1 })
        .lean(),
      ApplicationType.find({ active: true })
        .select('name code department description requiredDocuments formFieldSchema')
        .populate('department', 'name code')
        .sort({ name: 1 })
        .lean(),
      getSetting('platform.name', 'Smart District Administration System'),
      getSetting('platform.supportEmail', ''),
      getSetting('platform.supportPhone', ''),
    ]);

  return {
    platform: { name: platformName, supportEmail, supportPhone },
    grievanceCategories: categories,
    departments,
    administrativeUnits: units,
    offices,
    fileCategories,
    applicationTypes,
  };
}

export async function listOfficers(req: Request) {
  const query = req.query as Record<string, string | undefined>;
  const filter: Record<string, unknown> = {
    role: { $in: ['CLERK', 'OFFICER', 'DEPARTMENT_HEAD'] },
    status: 'ACTIVE',
  };

  if (query.department) {
    const scopedDepartment =
      req.user!.role === 'DEPARTMENT_HEAD' || req.user!.role === 'OFFICER'
        ? req.user!.department
        : query.department;
    if (scopedDepartment) filter.department = scopedDepartment;
  } else if (req.user!.department && req.user!.role !== 'DISTRICT_ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
    filter.department = req.user!.department;
  }

  const officers = await User.find(filter as never)
    .select('name designation role department departmentName office status')
    .populate('department', 'name code')
    .sort({ name: 1 })
    .limit(500)
    .lean();

  return officers.map((officer) => {
    const record = officer as Record<string, any>;
    const department = record.department;
    return {
      id: String(record._id),
      name: record.name,
      designation: record.designation ?? null,
      role: record.role,
      roleLabel: ROLE_LABELS[record.role as keyof typeof ROLE_LABELS] ?? record.role,
      department:
        department && typeof department === 'object'
          ? { id: String(department._id), name: department.name, code: department.code }
          : null,
    };
  });
}
