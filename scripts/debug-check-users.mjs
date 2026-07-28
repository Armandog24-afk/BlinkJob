import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: authUsers, error: authErr } = await admin.auth.admin.listUsers();
if (authErr) console.error("auth.admin.listUsers error:", authErr);
else {
  console.log(`auth.users count: ${authUsers.users.length}`);
  for (const u of authUsers.users) {
    console.log(`- ${u.email} | confirmed_at=${u.confirmed_at ?? u.email_confirmed_at} | created_at=${u.created_at}`);
  }
}

const { data: publicUsers, error: pubErr } = await admin.from("users").select("id,email,role,status,full_name");
if (pubErr) console.error("public.users error:", pubErr);
else {
  console.log(`public.users count: ${publicUsers.length}`);
  for (const u of publicUsers) {
    console.log(`- ${u.email} | role=${u.role} | status=${u.status} | full_name=${u.full_name}`);
  }
}
