-- Replaces the placeholder catalogue seeded by 20260919084300 with the real ENA
-- range: solar generation and building-integrated PV, lithium storage, power
-- conversion, portable stations, EV charging, mini-grid control and ENA Control.
--
-- Only the rows that earlier migration inserted are removed, matched by slug,
-- sku or identifier, so anything an operator has since added is left alone.
-- Prices are left NULL: the range is quoted per project, and the catalogue
-- renders a NULL price as "On application".

DELETE FROM "stock_items" WHERE "sku" IN (
  'MTR-1P-STS','MTR-3P-STS','TILE-R6','PNL-550','LI360-10','CAB-40','EVC-PLUS','EVC-DC60','POPS-24','POPS-PACK');

DELETE FROM "devices" WHERE "identifier" IN (
  '4512 8890 231','INV-LG-0041','LI360-00218','PLUS-01044','DC60-00007','CAB40-00113','4512 9004 118');

-- product_updates cascade with their product
DELETE FROM "products" WHERE "slug" IN (
  'ena-smart-meter-1p','ena-smart-meter-3p','ena-solar-roof-tile','ena-panel-550',
  'ena-li-360','ena-cell-cabinet','ena-plus-charger','ena-dc-pedestal','ena-pops','ena-kiosk');

INSERT INTO "products" ("slug","name","category","tagline","description","price_kobo","price_note","status","specs","sort_order") VALUES
('ena-solar-panel','ENA Solar Panels','solar','Monocrystalline and bifacial modules, 400 Wp to 700 Wp+',
 'Framed modules for rooftop, ground-mount, mini-grid and utility arrays. Monocrystalline for the general case, bifacial glass-glass where the ground or roof membrane returns enough light to pay for it. Specified per project against the array layout rather than sold as a single fixed model.',
 NULL,'quoted per array','available',
 '[{"k":"Power class","v":"400 Wp - 700 Wp+"},{"k":"Cell","v":"Monocrystalline; bifacial glass-glass option"},{"k":"Applications","v":"Rooftop, ground-mount, utility, mini-grid"},{"k":"Mounting","v":"Framed, rail-compatible"},{"k":"Supply","v":"Module and full array design"}]',10),

('ena-slates','ENA Slates','solar','Solar roofing slates - the roof is the array',
 'Building-integrated PV that replaces the roof covering instead of sitting on top of it. Interlocking courses mean no racking and no per-module penetration of the deck, and nothing stands proud of the roofline. Best suited to new build, full re-roofs and elevations where planning cares how the roof looks.',
 NULL,'quoted per roof, supplied and fitted','available',
 '[{"k":"Function","v":"Weathering layer and generation in one"},{"k":"Fixing","v":"Interlocking courses, no per-module racking"},{"k":"Best fit","v":"New build, full re-roof, sensitive elevations"},{"k":"Reporting","v":"Per-roof generation in ENA Control"}]',20),

('ena-cladding','ENA Cladding','solar','Solar facade, curtain wall and spandrel panels',
 'On a tall building the roof is the smallest plane available. ENA Cladding brings generation onto facades, curtain walling and the opaque spandrel bands between floors. In hot climates the panel also shades the surface it covers, which cuts the cooling load behind it.',
 NULL,'design-and-build with the facade contractor','available',
 '[{"k":"Formats","v":"Facade, curtain wall, spandrel"},{"k":"Secondary benefit","v":"Shades the clad surface, reducing cooling load"},{"k":"Certification","v":"Specified against project standards, incl. GSAS"},{"k":"Reporting","v":"Per-surface generation in ENA Control"}]',30),

('ena-streetlight','ENA Solar Streetlight','solar','Standalone solar lighting, no trenching',
 'Pole-mounted PV, battery and LED luminaire as one unit, so a road, yard or compound is lit without a cable run back to a distribution board. Charges through the day and runs on its own overnight, with no connection to lose during an outage.',
 NULL,'quoted per scheme','available',
 '[{"k":"Configuration","v":"Integrated PV, battery and LED luminaire"},{"k":"Installation","v":"Pole-mounted, no trenching or cable run"},{"k":"Operation","v":"Autonomous, dusk-to-dawn"},{"k":"Applications","v":"Roads, compounds, yards, campuses"}]',40),

('ena-solar-pump','ENA Solar Water Pumping','solar','Direct-drive solar pumping for irrigation and supply',
 'Array, controller and pump sized together so water moves while the sun is up and storage happens in the tank rather than in a battery. Used for irrigation, livestock, borehole supply and community water points where a diesel pump is the only alternative.',
 NULL,'quoted per site and head','available',
 '[{"k":"Drive","v":"Direct solar, no battery required"},{"k":"Storage","v":"In the tank, not in a pack"},{"k":"Applications","v":"Irrigation, livestock, borehole and community supply"},{"k":"Supply","v":"Array, controller and pump as one package"}]',50),

('ena-powerwall','ENA Powerwall','storage','Stackable LiFePO4 storage, 5 kWh to 25 kWh',
 'LiFePO4 modules that stack as the load grows, so a household can start at one module and add capacity later without replacing the inverter or re-commissioning the system. The same architecture scales into commercial and industrial cabinets for sites measuring storage in hundreds of kilowatt-hours.',
 NULL,'quoted per configuration','available',
 '[{"k":"Usable energy","v":"5 kWh - 25 kWh, stackable"},{"k":"Chemistry","v":"LiFePO4"},{"k":"Segments","v":"Residential, commercial and industrial"},{"k":"Expansion","v":"Add modules without re-commissioning"},{"k":"Monitoring","v":"State of charge, cell temperature and cycles in ENA Control"}]',60),

('ena-lit-li','ENA LIT LI','storage','Wall-mounted LiFePO4 with a front touchscreen',
 'Hangs on its own mounting plate, reads out on the front and lands every connection on the underside: parallel links for stacking, CAN and RS485 to the inverter, covered DC busbars and an earth stud. Sealed and fanless, so it can live in a hallway or a plant room without a cooling budget.',
 NULL,'quoted per configuration','available',
 '[{"k":"Format","v":"Wall-mounted, integrated mounting plate"},{"k":"Chemistry","v":"LiFePO4"},{"k":"Interface","v":"Front colour touchscreen"},{"k":"Communications","v":"CAN and RS485 to the inverter"},{"k":"Terminals","v":"Covered DC busbars, parallel links, earth stud"}]',70),

('ena-hybrid-bess','ENA Hybrid BESS','storage','Lithium paired with gas generation for prime power',
 'For captive and prime-power sites that have to run through the night and through a bad week. The battery takes the peaks and the cycling while the gas set carries sustained base load, with one controller arbitrating between them - so the generation plant is sized for the average rather than the worst minute of the month.',
 NULL,'quoted per project','available',
 '[{"k":"Architecture","v":"Lithium storage plus gas generation"},{"k":"Duty","v":"Captive and prime power"},{"k":"Benefit","v":"Peak shaving, smaller generation plant"},{"k":"Control","v":"Single controller arbitrates sources"}]',80),

('ena-hybrid-inverter','ENA Hybrid Inverter','conversion','Hybrid inverters from 1 kVA to 50 kVA and above',
 'Takes PV, battery, grid and generator inputs and decides between them. Sized from a single-room backup up to industrial three-phase duty, and specified alongside the array and the storage rather than bought separately and hoped about.',
 NULL,'quoted per system','available',
 '[{"k":"Rating","v":"1 kVA - 50 kVA+"},{"k":"Phases","v":"Single and three phase"},{"k":"Inputs","v":"PV, battery, grid, generator"},{"k":"Monitoring","v":"Reports into ENA Control"}]',90),

('ena-mppt-controller','ENA MPPT Charge Controller','conversion','Charge controllers matched to the specified array',
 'Maximum power point tracking controllers supplied against the array they will actually run, so the string voltage, the current and the pack all agree with each other. Issued as part of the same bill of materials as the modules and the storage.',
 NULL,'quoted per system','available',
 '[{"k":"Tracking","v":"MPPT"},{"k":"Matching","v":"Specified against the array and pack"},{"k":"Supply","v":"Part of the system bill of materials"}]',100),

('ena-ats-board','ENA Transfer Switching & Distribution','conversion','Automatic transfer switches and distribution boards',
 'The switchgear between the sources and the load: automatic transfer switching between grid, generation and storage, plus distribution boards built for the design rather than adapted to it on site.',
 NULL,'quoted per project','available',
 '[{"k":"Switching","v":"Automatic transfer between grid, generation and storage"},{"k":"Distribution","v":"Boards built to the electrical design"},{"k":"Supply","v":"Coordinated with the conversion package"}]',110),

('ena-pops','ENA POPS','portable','Portable outdoor power station, 300 W to 3 kW',
 'Inverter, battery, charge controller and outputs in a single sealed case with carry handles - nothing to wire up on arrival. AC sockets, DC outputs and USB on the front, and a solar input so it recharges wherever it is standing. Built for work sites, marine and field use, clinics and outage cover.',
 NULL,'quoted by model and quantity','available',
 '[{"k":"Output","v":"300 W - 3 kW, by model"},{"k":"Usable energy","v":"Up to 4 kWh"},{"k":"Outputs","v":"AC sockets, DC outputs, USB"},{"k":"Charging","v":"Solar input, mains, vehicle"},{"k":"Build","v":"Sealed case, carry handles, outdoor duty"}]',120),

('ena-ev-charger','ENA EV Charger','ev','AC and DC charging, specified with storage behind it',
 'Single- and three-phase AC units where vehicles sit for hours, and DC units for fleet depots and forecourts where they cannot. Specified with ENA storage in front of the connection, so a site adds bays without paying for a reinforced supply. Supplied by Ena Plus.',
 NULL,'quoted per site and duty cycle','available',
 '[{"k":"AC charging","v":"Single and three phase, dwell-time duty"},{"k":"DC charging","v":"Fleet depot and forecourt turnaround"},{"k":"Behind the charger","v":"ENA storage and hybrid conversion"},{"k":"Specification","v":"Issued per project, per duty cycle"}]',130),

('ena-minigrid-controller','ENA Mini-grid Controller & EMS','systems','Energy management for mini-grids and campuses',
 'Dispatches generation, storage and any generator on site against the measured load, and reports the whole plant into ENA Control. Supplied with the transfer switching, distribution and metering rather than as a box that arrives separately and has to be made to fit.',
 NULL,'quoted per plant','available',
 '[{"k":"Function","v":"Dispatch and energy management"},{"k":"Sources","v":"PV, storage, grid, generator"},{"k":"Scale","v":"Mini-grid, microgrid, campus, industrial"},{"k":"Reporting","v":"Whole-plant data into ENA Control"}]',140),

('ena-prepaid-meter','ENA Prepaid Meter','metering','Single- and three-phase prepaid metering with vending',
 'Prepaid meters for mini-grids, estates and captive sites, with the vending path behind them: register a device once by IMEI or RFID, then sell units to it from the web or the app. An offline meter queues the credit for fourteen days and a backup token is issued with every purchase.',
 NULL,'quoted per network','available',
 '[{"k":"Phases","v":"Single and three phase"},{"k":"Comms","v":"NB-IoT with GPRS fallback"},{"k":"Vending","v":"Token plus direct push to the device"},{"k":"Accuracy","v":"Class 1"},{"k":"Offline queue","v":"14 days"}]',150),

('ena-control','ENA Control','software','Monitoring, management and ESG reporting',
 'One platform across panels, storage, inverters, meters and portable units, on the web and in the app on the same login and the same API. Live generation and storage state, remote configuration and alerts, plus displacement and avoided-emissions reporting exportable for ESG and GSAS submissions.',
 NULL,'included with an ENA installation','available',
 '[{"k":"Live data","v":"Generation, load, storage state, grid draw"},{"k":"Control","v":"Operating mode, charge windows, limits"},{"k":"Alerts","v":"Faults, derates and offline assets"},{"k":"Reporting","v":"ESG and GSAS exports, per asset and period"},{"k":"Access","v":"Web and mobile, one login, one API"}]',160);

INSERT INTO "product_updates" ("product_id","title","body","kind","published") VALUES
((SELECT id FROM products WHERE slug='ena-lit-li'),'ENA LIT LI documentation published',
 'Full mechanical and electrical drawings for the wall-mounted LIT LI are now available to installers, covering the mounting plate, the parallel links and the CAN and RS485 pinout to the inverter.','release',true),
((SELECT id FROM products WHERE slug='ena-powerwall'),'Powerwall stacking extended to 25 kWh',
 'The residential stack now qualifies to 25 kWh usable on a single inverter, so a household sized at one module can reach a full-day reserve without re-commissioning the system.','release',true),
((SELECT id FROM products WHERE slug='ena-pops'),'POPS range now spans 300 W to 3 kW',
 'The portable range covers 300 W through 3 kW of output and up to 4 kWh of usable energy, with solar input on every model. Fleet quantities for field teams and clinics are quoted separately.','release',true),
((SELECT id FROM products WHERE slug='ena-control'),'ESG and GSAS exports available',
 'ENA Control now exports displacement and avoided-emissions figures per asset and per period, in the formats ESG reporting and GSAS assessment ask for. Available on every account at no extra cost.','release',true),
((SELECT id FROM products WHERE slug='ena-solar-panel'),'Bifacial option added to the module range',
 'Bifacial glass-glass modules are now specifiable alongside the monocrystalline range, for ground-mount and high-albedo roof installations where the rear-side gain justifies the cost.','notice',true),
((SELECT id FROM products WHERE slug='ena-prepaid-meter'),'Offline vending queue extended to 14 days',
 'Purchases made against an offline meter now hold for fourteen days rather than seven before expiring back to the wallet. The backup token is still issued at the time of purchase either way.','notice',true);

INSERT INTO "stock_items" ("sku","product_id","name","warehouse","quantity","reorder_level","unit_cost_kobo") VALUES
('PNL-MONO',(SELECT id FROM products WHERE slug='ena-solar-panel'),'ENA Solar Panel - monocrystalline','abuja-hq',1240,300,NULL),
('PNL-BIFI',(SELECT id FROM products WHERE slug='ena-solar-panel'),'ENA Solar Panel - bifacial','abuja-hq',480,150,NULL),
('SLATE-STD',(SELECT id FROM products WHERE slug='ena-slates'),'ENA Slate','abuja-hq',8600,2000,NULL),
('CLAD-SPAN',(SELECT id FROM products WHERE slug='ena-cladding'),'ENA Cladding - spandrel panel','abuja-hq',320,80,NULL),
('PWALL-5',(SELECT id FROM products WHERE slug='ena-powerwall'),'ENA Powerwall - 5 kWh module','abuja-hq',260,60,NULL),
('LITLI-WM',(SELECT id FROM products WHERE slug='ena-lit-li'),'ENA LIT LI - wall-mounted','abuja-hq',175,40,NULL),
('INV-HYB-5',(SELECT id FROM products WHERE slug='ena-hybrid-inverter'),'ENA Hybrid Inverter - 5 kVA','abuja-hq',310,80,NULL),
('INV-HYB-30',(SELECT id FROM products WHERE slug='ena-hybrid-inverter'),'ENA Hybrid Inverter - 30 kVA','abuja-hq',42,12,NULL),
('MPPT-STD',(SELECT id FROM products WHERE slug='ena-mppt-controller'),'ENA MPPT Charge Controller','abuja-hq',540,120,NULL),
('POPS-2K',(SELECT id FROM products WHERE slug='ena-pops'),'ENA POPS - 2 kW','quincy-ma',410,100,NULL),
('POPS-3K',(SELECT id FROM products WHERE slug='ena-pops'),'ENA POPS - 3 kW','quincy-ma',185,60,NULL),
('EVC-AC',(SELECT id FROM products WHERE slug='ena-ev-charger'),'ENA EV Charger - AC','abuja-hq',96,30,NULL),
('MTR-PRE',(SELECT id FROM products WHERE slug='ena-prepaid-meter'),'ENA Prepaid Meter','abuja-hq',1620,400,NULL),
('EMS-MG',(SELECT id FROM products WHERE slug='ena-minigrid-controller'),'ENA Mini-grid Controller','abuja-hq',28,10,NULL);

INSERT INTO "devices" ("name","type","identifier","reading","status") VALUES
('Apo mini-grid feeder meter','meter','4512 8890 231','84.6 kWh','online'),
('Apo rooftop array','inverter','INV-ABJ-0041','3.1 kW','online'),
('Apo hallway LIT LI','battery','LITLI-00218','41%','online'),
('Gudu compound charger','charger','EVC-AC-01044','idle','online'),
('Eterna Station pedestal','charger','EVC-DC-00007','62 kW','online'),
('Gudu Powerwall stack A','battery','PWALL-00113','78%','online'),
('Market stall meter','meter','4512 9004 118','12.2 kWh','offline');
