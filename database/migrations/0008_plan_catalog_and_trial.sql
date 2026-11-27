BEGIN;
INSERT INTO app.plans(code,name,monthly_price_minor,currency,daily_url_quota,max_projects,features,is_active)
VALUES
 ('free','Free',0,'USD',500,1,'{"api_access":false,"team_members":1}',true),
 ('growth','Growth',4900,'USD',25000,25,'{"api_access":true,"team_members":5}',true),
 ('scale','Scale',19900,'USD',1000000,250,'{"api_access":true,"team_members":25,"priority_queue":true}',true)
ON CONFLICT(code) DO NOTHING;
COMMIT;
