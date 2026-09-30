import { db } from "../server/db/index.js";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function main() {
  // Check categories and plans
  const cats = await db.execute(sql`SELECT id, name FROM categories ORDER BY id LIMIT 10`);
  const plans = await db.execute(sql`SELECT id, code, name, role FROM subscription_plans ORDER BY id`);
  console.log("CATEGORIES:", JSON.stringify(cats.rows));
  console.log("PLANS:", JSON.stringify(plans.rows));

  const hashedPassword = await bcrypt.hash("Admin123!", 10);

  // Delete existing admin test account if exists
  await db.execute(sql`DELETE FROM users WHERE email = 'admin@fixxer.cl'`);

  // Create admin user
  const userResult = await db.execute(sql`
    INSERT INTO users (
      name, email, password, role, status,
      phone, bio, skills,
      category_id,
      rating, total_reviews,
      client_rating, client_total_reviews,
      kyc_status,
      is_available, service_radius,
      lat, lng,
      email_verified, phone_verified,
      platform_type,
      created_at, updated_at
    ) VALUES (
      'Admin Fixgo',
      'admin@fixxer.cl',
      ${hashedPassword},
      'admin',
      'active',
      '+56912345678',
      'Cuenta de administración con perfil completo de profesional verificado para pruebas del sistema Fixgo.',
      'Electricidad, Plomería, Gasfitería, Instalaciones, Reparaciones generales',
      1,
      4.9,
      87,
      4.8,
      32,
      'approved',
      true,
      30,
      -33.4569,
      -70.6483,
      true,
      true,
      'expertos',
      NOW(),
      NOW()
    ) RETURNING id
  `);

  const userId = (userResult.rows[0] as any).id;
  console.log("✅ Usuario admin creado con ID:", userId);

  // Add worker categories (use first 3 available)
  const catIds = (cats.rows as any[]).slice(0, 3).map((c: any) => c.id);
  for (let i = 0; i < catIds.length; i++) {
    await db.execute(sql`
      INSERT INTO worker_categories (worker_id, category_id, is_primary)
      VALUES (${userId}, ${catIds[i]}, ${i === 0})
      ON CONFLICT DO NOTHING
    `);
  }
  console.log("✅ Categorías asignadas:", catIds);

  // Create KYC document approved
  await db.execute(sql`
    INSERT INTO kyc_documents (
      user_id, document_type, rut, full_name,
      cedula_front_path, cedula_back_path, selfie_path, antecedentes_path,
      status, reviewed_by, reviewed_at,
      created_at, updated_at
    ) VALUES (
      ${userId},
      'cedula',
      '12.345.678-9',
      'Admin Fixgo Test',
      '/uploads/kyc/cedula_front_placeholder.jpg',
      '/uploads/kyc/cedula_back_placeholder.jpg',
      '/uploads/kyc/selfie_placeholder.jpg',
      '/uploads/kyc/antecedentes_placeholder.jpg',
      'approved',
      ${userId},
      NOW(),
      NOW(),
      NOW()
    )
  `);
  console.log("✅ KYC aprobado creado");

  // Add subscription if plans exist
  if ((plans.rows as any[]).length > 0) {
    const workerPlan = (plans.rows as any[]).find((p: any) => p.role === "worker") || plans.rows[0];
    await db.execute(sql`
      INSERT INTO user_subscriptions (
        user_id, plan_code, status, interval,
        price_paid_clp, current_period_start, current_period_end,
        created_at, updated_at
      ) VALUES (
        ${userId},
        ${(workerPlan as any).code},
        'active',
        'monthly',
        0,
        NOW(),
        NOW() + INTERVAL '1 year',
        NOW(),
        NOW()
      )
    `);
    console.log("✅ Suscripción activa asignada:", (workerPlan as any).code);
  }

  console.log("\n========================================");
  console.log("CUENTA ADMIN CREADA EXITOSAMENTE");
  console.log("========================================");
  console.log("Email:    admin@fixxer.cl");
  console.log("Password: Admin123!");
  console.log("Rol:      admin");
  console.log("KYC:      approved");
  console.log("========================================\n");
}

main().catch(console.error).finally(() => process.exit(0));
