BEGIN;
CREATE TABLE app.platform_user_roles (
 user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
 role_id uuid NOT NULL REFERENCES app.roles(id) ON DELETE CASCADE,
 assigned_by uuid REFERENCES app.users(id),
 assigned_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,role_id)
);

-- Tenant owner: all tenant-level capabilities.
INSERT INTO app.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM app.roles r CROSS JOIN app.permissions p
WHERE r.code='owner'
ON CONFLICT DO NOTHING;

-- Tenant administrator: all tenant operations except platform-wide administration.
INSERT INTO app.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM app.roles r CROSS JOIN app.permissions p
WHERE r.code='admin' AND p.code <> 'admin.manage'
ON CONFLICT DO NOTHING;

INSERT INTO app.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM app.roles r JOIN app.permissions p ON p.code IN
 ('tenant.read','project.read','project.manage','url.read','url.manage','campaign.manage','report.read','api_key.manage','webhook.manage')
WHERE r.code='manager'
ON CONFLICT DO NOTHING;

INSERT INTO app.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM app.roles r JOIN app.permissions p ON p.code IN
 ('tenant.read','project.read','url.read','report.read')
WHERE r.code='analyst'
ON CONFLICT DO NOTHING;

INSERT INTO app.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM app.roles r JOIN app.permissions p ON p.code IN
 ('tenant.read','project.read','url.read','report.read')
WHERE r.code='viewer'
ON CONFLICT DO NOTHING;

-- Platform super-admin is assigned only by a controlled bootstrap procedure.
-- Never auto-assign this role to the first public signup.
COMMIT;
