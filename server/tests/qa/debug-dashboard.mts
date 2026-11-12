import 'dotenv/config';
import dns from 'node:dns';
import { connectDB, disconnectDB } from '../../src/config/db';
import { getDashboard } from '../../src/services/dashboard.service';
import { User } from '../../src/models/user';
import { getPermissionsForRole } from '../../src/services/permission.service';

if (String(process.env.MONGODB_URI).startsWith('mongodb+srv://')) {
  const servers = (process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  dns.setServers(servers);
}

const emails = [
  'qa.citizen@sdas.test',
  'qa.clerk@sdas.test',
  'qa.officer@sdas.test',
  'qa.head@sdas.test',
  'qa.district@sdas.test',
  'qa.admin@sdas.test',
];

const run = async () => {
  await connectDB();
  let failed = 0;
  for (const email of emails) {
    try {
      const user = await User.findOne({ email }).lean();
      if (!user) throw new Error(`no user ${email}`);
      const permissions = await getPermissionsForRole(user.role);
      const req: any = {
        user: {
          id: user._id.toString(),
          role: user.role,
          department: user.department ? user.department.toString() : null,
          permissions,
        },
        query: {},
        params: {},
      };
      const data: any = await getDashboard(req);
      console.log(
        'OK',
        email,
        user.role,
        'stats=' + JSON.stringify(data.stats),
        'grievanceStatus=' + JSON.stringify(data.charts?.grievancesByStatus),
        'trendPoints=' + (data.charts?.grievanceTrend?.length ?? 0),
      );
    } catch (error) {
      failed += 1;
      console.error('FAIL', email, (error as Error)?.stack || error);
    }
  }
  await disconnectDB();
  if (failed) process.exitCode = 1;
};

run();
