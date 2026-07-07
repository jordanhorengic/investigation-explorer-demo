(function () {
  const mock = window.INVESTIGATION_MOCK;
  if (!mock) {
    return;
  }

  function id(n) {
    return `a1b2c3d4-0000-0000-0000-${String(n).padStart(12, '0')}`;
  }

  const CASE_0078 = id(20);
  const CASE_0124 = id(25);
  const LOC_CLUB = id(3);
  const LOC_SHOP = id(2);
  const LOC_CAFE = id(8);

  const LOC = {
    SENDLINGER: 501,
    ISARTOR: 502,
    VIKTUALIEN: 503,
    GLOCKENBACH: 504,
    THERESIEN: 505,
    MARIEN: 506,
    HBF: 507,
    MAXVORSTADT: 508,
    RIVERSIDE: 509,
    PERLACH: 510,
  };

  const ORG = {
    CAFE_ROMA: 521,
    SICHERHEIT: 522,
    LOGISTIK: 523,
    BIKE_SHOP: 524,
  };

  const CASE = {
    VG0150: 526,
    VG0188: 532,
    VG0210: 533,
  };

  const extraEntities = [];
  const extraRelations = [];

  function addEntity(entity) {
    extraEntities.push(entity);
    return entity;
  }

  function relate(from, to, label, extra = {}) {
    extraRelations.push({ from, to, label, ...extra });
  }

  const munichLocations = [
    { n: LOC.SENDLINGER, label: 'Sendlinger Tor', street: 'Sendlinger-Tor-Platz', plz: '80331', lat: 48.1335, lon: 11.5665 },
    { n: LOC.ISARTOR, label: 'Isartor', street: 'Tal', plz: '80331', lat: 48.1354, lon: 11.5821 },
    { n: LOC.VIKTUALIEN, label: 'Viktualienmarkt Stand 14', street: 'Viktualienmarkt', plz: '80331', lat: 48.1358, lon: 11.5762 },
    { n: LOC.GLOCKENBACH, label: 'Glockenbachwerkstatt', street: 'Baaderstraße', plz: '80469', lat: 48.1298, lon: 11.5734 },
    { n: LOC.THERESIEN, label: 'Theresienwiese Süd', street: 'Theresienwiese', plz: '80336', lat: 48.1317, lon: 11.5493 },
    { n: LOC.MARIEN, label: 'Marienplatz Nord', street: 'Marienplatz', plz: '80331', lat: 48.1374, lon: 11.5755 },
    { n: LOC.HBF, label: 'Hauptbahnhof Vorplatz', street: 'Bayerstraße', plz: '80335', lat: 48.1402, lon: 11.5584 },
    { n: LOC.MAXVORSTADT, label: 'Maxvorstadt Parkgarage', street: 'Schellingstraße', plz: '80799', lat: 48.1496, lon: 11.5742 },
    { n: LOC.RIVERSIDE, label: 'Riverside Lagerhalle', street: 'Friedenheimer Brücke', plz: '80639', lat: 48.1439, lon: 11.5124 },
    { n: LOC.PERLACH, label: 'Perlach Zentrum', street: 'Pepperstraße', plz: '81737', lat: 48.1068, lon: 11.6284 },
  ];

  for (const loc of munichLocations) {
    addEntity({
      id: id(loc.n),
      type: 'Location',
      attributes: {
        BEZEICHNUNG: loc.label,
        STRASSE: loc.street,
        ORTSNAME: 'München',
        REGION: 'München',
        PLZ: loc.plz,
        GEO_LAT: loc.lat,
        GEO_LON: loc.lon,
      },
      geo: { lat: loc.lat, lon: loc.lon },
    });
  }

  const identityNames = [
    ['Sandra', 'Sauer'],
    ['Andrea', 'Frank'],
    ['Sandra', 'Schwartz'],
    ['Andrea', 'Meyer'],
    ['Andreas', 'Bauer'],
    ['Sandra', 'Keller'],
    ['Andrea', 'Wolf'],
    ['Andreas', 'Lehmann'],
    ['Sandra', 'Huber'],
    ['Michael', 'Braun'],
    ['Petra', 'Schneider'],
    ['Thomas', 'Hoffmann'],
    ['Julia', 'Richter'],
    ['Markus', 'Fischer'],
    ['Laura', 'Wagner'],
  ];

  for (let i = 0; i < identityNames.length; i += 1) {
    const [vorname, nachname] = identityNames[i];
    const identityId = id(200 + i);
    const personId = id(400 + i);
    const homeLocation = id(munichLocations[i % munichLocations.length].n);

    addEntity({
      id: identityId,
      type: 'Identity Record',
      attributes: {
        VORNAME: vorname,
        NACHNAME: nachname,
        GEBURTSORT: i % 3 === 0 ? 'Augsburg' : 'München',
        GEBURTSDATUM: `198${i % 10}-0${(i % 8) + 1}-15`,
        PERSON_ID: personId,
      },
    });

    addEntity({
      id: personId,
      type: 'Person',
      attributes: {
        ANONYMISIERUNGSSCHLUESSEL: `P-GEN-${String(i + 1).padStart(3, '0')}`,
        IDENTITY_RECORD_ID: identityId,
      },
      personLocations: [{ label: 'Home', locationId: homeLocation }],
    });

    relate(personId, identityId, 'Identity record');
    relate(personId, homeLocation, 'Person residence location', {
      kind: 'location',
      role: 'Home',
      relationshipType: 'Person_Wohnsitz_Oertlichkeit',
    });
  }

  const organisations = [
    {
      n: ORG.CAFE_ROMA,
      name: 'Café Roma OHG',
      type: 'Gastronomie',
      seat: id(LOC.VIKTUALIEN),
      vorstand: 'Schwarz, Sandra',
    },
    {
      n: ORG.SICHERHEIT,
      name: 'Münchner Sicherheitsdienst GmbH',
      type: 'Sicherheitsdienst',
      seat: id(LOC.MARIEN),
    },
    {
      n: ORG.LOGISTIK,
      name: 'Bayern Logistik Express',
      type: 'Transport',
      seat: id(LOC.RIVERSIDE),
    },
    {
      n: ORG.BIKE_SHOP,
      name: 'Maxvorstadt Bike Shop',
      type: 'Einzelhandel',
      seat: id(LOC.MAXVORSTADT),
    },
  ];

  for (const org of organisations) {
    addEntity({
      id: id(org.n),
      type: 'Organisation',
      attributes: {
        NAME: org.name,
        ORGANISATIONSTYP: org.type,
        SITZ_OERTLICHKEIT_ID: org.seat,
        ...(org.vorstand ? { VORSTAND: org.vorstand } : {}),
      },
      locationId: org.seat,
    });
    relate(id(org.n), org.seat, 'Organisation HQ location', {
      kind: 'location',
      role: 'Headquarter',
      relationshipType: 'Organisation_Sitz_Oertlichkeit',
    });
  }

  relate(id(400 + 2), id(ORG.CAFE_ROMA), 'Person linked to organisation');
  relate(id(400 + 9), id(400 + 2), 'Person associated with witness');

  const caseFiles = [
    { n: CASE.VG0150, az: 'VG-2026-0150', title: 'Bedrohung Maxvorstadt', opened: '2026-02-10' },
    { n: CASE.VG0188, az: 'VG-2026-0188', title: 'Drogenfund Sendling', opened: '2026-04-18' },
    { n: CASE.VG0210, az: 'VG-2026-0210', title: 'Lkw-Diebstahlserie Ost', opened: '2026-05-03' },
  ];

  for (const caseFile of caseFiles) {
    addEntity({
      id: id(caseFile.n),
      type: 'Case File',
      attributes: {
        AKTENZEICHEN: caseFile.az,
        TITEL: caseFile.title,
        STATUS: 'In Bearbeitung',
        EROEFFNET_AM: caseFile.opened,
      },
    });
  }

  relate(CASE_0078, id(CASE.VG0150), 'Related case file');
  relate(id(CASE.VG0150), id(400 + 2), 'Witness linked to case');
  relate(id(CASE.VG0150), id(ORG.CAFE_ROMA), 'Organisation linked to case');
  relate(id(CASE.VG0188), id(400 + 9), 'Person linked to case');
  relate(id(CASE.VG0210), id(ORG.LOGISTIK), 'Organisation linked to case');

  const vehicles = [
    { n: 551, plate: 'M-SW 4411', make: 'Audi', model: 'A4', color: 'silver', owner: id(400 + 4) },
    { n: 552, plate: 'M-EV 2208', make: 'Mercedes', model: 'C220', color: 'blue', owner: id(400 + 0) },
    { n: 553, plate: 'M-TK 9090', make: 'BMW', model: 'X3', color: 'black', owner: id(400 + 9) },
    { n: 554, plate: 'M-HW 7700', make: 'VW', model: 'Transporter', color: 'white', owner: id(22) },
    { n: 555, plate: 'M-PD 3312', make: 'Opel', model: 'Corsa', color: 'red', owner: id(400 + 6) },
    { n: 556, plate: 'M-GR 1188', make: 'Ford', model: 'Focus', color: 'green', owner: id(400 + 3) },
    { n: 557, plate: 'M-LG 5501', make: 'MAN', model: 'TGL', color: 'white', owner: id(ORG.LOGISTIK) },
    { n: 558, plate: 'M-BK 9021', make: 'Yamaha', model: 'MT-07', color: 'black', owner: id(400 + 11) },
  ];

  for (const vehicle of vehicles) {
    addEntity({
      id: id(vehicle.n),
      type: 'Motor Vehicle',
      attributes: {
        KENNZEICHEN: vehicle.plate,
        MARKE: vehicle.make,
        MODELL: vehicle.model,
        FARBE: vehicle.color,
        FIN: `FIN${vehicle.n}${vehicle.plate.replace(/\W/g, '')}`,
        HALTER_PERSONALIE_ID: vehicle.owner,
      },
    });
    relate(CASE_0078, id(vehicle.n), 'Vehicle linked to case');
    relate(id(vehicle.n), vehicle.owner, 'Vehicle owner (Person)');
  }

  const offences = [
    { n: 561, case: CASE_0078, type: 'Diebstahl', paragraph: '§ 242 StGB', when: '2026-01-28T02:20:00', where: LOC_SHOP },
    { n: 562, case: id(CASE.VG0150), type: 'Bedrohung', paragraph: '§ 241 StGB', when: '2026-02-05T18:10:00', where: id(LOC.VIKTUALIEN) },
    { n: 563, case: id(CASE.VG0188), type: 'Drogenhandel', paragraph: '§ 29 BtMG', when: '2026-04-12T22:40:00', where: id(LOC.SENDLINGER) },
    { n: 564, case: id(CASE.VG0210), type: 'Sachbeschädigung', paragraph: '§ 303 StGB', when: '2026-05-01T01:15:00', where: id(LOC.RIVERSIDE) },
    { n: 565, case: CASE_0124, type: 'Landfriedensbruch', paragraph: '§ 125 StGB', when: '2026-05-20T21:00:00', where: LOC_CLUB },
  ];

  for (const offence of offences) {
    addEntity({
      id: id(offence.n),
      type: 'Criminal Offence',
      attributes: {
        VORGANG_ID: offence.case,
        DELIKTART: offence.type,
        PARAGRAF: offence.paragraph,
        TATZEIT_VON: offence.when,
        TATORT_ID: offence.where,
      },
      locationId: offence.where,
    });
    relate(offence.case, id(offence.n), 'Criminal offence in case');
  }

  const regulatory = [
    { n: 571, case: id(CASE.VG0150), type: 'Lärmbelästigung', when: '2026-02-06T23:00:00', where: id(LOC.VIKTUALIEN) },
    { n: 572, case: id(CASE.VG0188), type: 'Rotlichtverstoß', when: '2026-04-15T07:30:00', where: id(LOC.ISARTOR) },
    { n: 573, case: CASE_0078, type: 'Geschwindigkeitsüberschreitung', when: '2026-03-01T16:45:00', where: id(LOC.THERESIEN) },
  ];

  for (const item of regulatory) {
    addEntity({
      id: id(item.n),
      type: 'Regulatory Offence',
      attributes: {
        VORGANG_ID: item.case,
        OWI_TYP: item.type,
        PARAGRAF: '§ 24 StVO',
        TATZEIT_VON: item.when,
        TATORT_ID: item.where,
      },
      locationId: item.where,
    });
    relate(item.case, id(item.n), 'Regulatory offence in case');
  }

  const accidents = [
    { n: 581, case: id(CASE.VG0210), type: 'Seitenstreifkollision', when: '2026-05-04T08:20:00', where: id(LOC.HBF) },
    { n: 582, case: id(CASE.VG0188), type: 'Alleinunfall', when: '2026-04-19T13:05:00', where: id(LOC.SENDLINGER) },
  ];

  for (const item of accidents) {
    addEntity({
      id: id(item.n),
      type: 'Traffic Accident',
      attributes: {
        VORGANG_ID: item.case,
        UNFALLART: item.type,
        UNFALL_DATUM_ZEIT: item.when,
        UNFALLKATEGORIE: 'PKW/PKW',
        ORT_ID: item.where,
      },
      locationId: item.where,
    });
    relate(item.case, id(item.n), 'Traffic accident in case');
  }

  const firearms = [
    { n: 591, type: 'Pistole', serial: 'PZ992011', where: id(7) },
    { n: 592, type: 'Schreckschussgerät', serial: 'SS771234', where: id(LOC.GLOCKENBACH) },
  ];

  for (const item of firearms) {
    addEntity({
      id: id(item.n),
      type: 'Firearm',
      attributes: {
        WAFFENTYP: item.type,
        SERIENNUMMER: item.serial,
        KALIBER: '9mm',
        FUNDORT_OERTLICHKEIT_ID: item.where,
      },
      locationId: item.where,
    });
    relate(CASE_0124, id(item.n), 'Firearm linked to case');
  }

  const measures = [
    { n: 601, case: id(CASE.VG0150), type: 'Anhaltung', when: '2026-02-07', where: id(LOC.VIKTUALIEN) },
    { n: 602, case: id(CASE.VG0188), type: 'Durchsuchung', when: '2026-04-20', where: id(LOC.SENDLINGER) },
    { n: 603, case: id(CASE.VG0210), type: 'Vernehmung', when: '2026-05-05', where: id(5) },
  ];

  for (const item of measures) {
    addEntity({
      id: id(item.n),
      type: 'Police Measure',
      attributes: {
        VORGANG_ID: item.case,
        MASSNAHME_TYP: item.type,
        RECHTSGRUNDLAGE: 'StPO',
        BEGINN_DATUM: item.when,
        ORT_ID: item.where,
      },
      locationId: item.where,
    });
    relate(item.case, id(item.n), 'Police measure in case');
  }

  const documents = [
    { n: 611, number: 'UR-2026-0201', type: 'Führerschein', label: 'Sendlinger Tor', lat: 48.1335, lon: 11.5665 },
    { n: 612, number: 'UR-2026-0202', type: 'Quittung', label: 'Viktualienmarkt', lat: 48.1358, lon: 11.5762 },
    { n: 613, number: 'UR-2026-0203', type: 'Handy-Screenshot', label: 'Marienplatz', lat: 48.1374, lon: 11.5755 },
    { n: 614, number: 'UR-2026-0204', type: 'Versicherungskarte', label: 'Perlach', lat: 48.1068, lon: 11.6284 },
  ];

  for (const item of documents) {
    addEntity({
      id: id(item.n),
      type: 'Documents',
      attributes: {
        URKUNDENNUMMER: item.number,
        URKUNDENTYP: item.type,
        FUNDORT_BEZEICHNUNG: item.label,
        FUNDORT_GEO_LAT: item.lat,
        FUNDORT_GEO_LON: item.lon,
      },
      geo: { lat: item.lat, lon: item.lon },
    });
    relate(CASE_0078, id(item.n), 'Document linked to case');
  }

  const tips = [
    {
      n: 621,
      case: id(CASE.VG0150),
      category: 'Person',
      text: 'Sandra Schwarz wird seit Monaten von Michael Braun bedroht.',
      channel: 'Online-Portal',
      credibility: 'Hoch',
    },
    {
      n: 622,
      case: id(CASE.VG0188),
      category: 'Drogen',
      text: 'Regelmäßige Übergaben am Sendlinger Tor in den Abendstunden.',
      channel: 'Telefon',
      credibility: 'Mittel',
    },
    {
      n: 623,
      case: id(CASE.VG0210),
      category: 'Fahrzeug',
      text: 'Weißer Transporter ohne Kennzeichen am Lagerhaus Friedenheimer Brücke.',
      channel: 'E-Mail',
      credibility: 'Mittel',
    },
    {
      n: 624,
      case: CASE_0124,
      category: 'Organisation',
      text: 'Treffen zwischen Hells Wolves und Iron Riders am Café Münchner Freiheit.',
      channel: 'Persönlich',
      credibility: 'Niedrig',
    },
  ];

  for (const item of tips) {
    addEntity({
      id: id(item.n),
      type: 'Tip and Lead',
      attributes: {
        VORGANG_ID: item.case,
        KATEGORIE: item.category,
        EINGANGSDATUM: '2026-05-12',
        EINGANGSWEG: item.channel,
        HINWEIS_TEXT: item.text,
        GLAUBWUERDIGKEIT: item.credibility,
      },
    });
    relate(item.case, id(item.n), 'Tip linked to case');
  }

  relate(id(621), id(400 + 2), 'Tip references witness');
  relate(id(621), id(400 + 9), 'Tip references person');
  relate(id(624), id(10), 'Tip references organisation');
  relate(id(624), id(16), 'Tip references organisation');

  const descriptions = [
    { n: 631, person: id(400 + 2), trait: 'schulterlanges schwarzes Haar', clothing: 'weiße Bluse' },
    { n: 632, person: id(400 + 9), trait: 'kahl, Bart', clothing: 'Lederjacke' },
    { n: 633, person: id(400 + 4), trait: 'Narbe über Augenbraue', clothing: 'graue Trainingsjacke' },
  ];

  for (const item of descriptions) {
    addEntity({
      id: id(item.n),
      type: 'Physical Description',
      attributes: {
        PERSON_ID: item.person,
        DISTINKTIVE_MERKMALE: item.trait,
        KLEIDUNG_TYP: item.clothing,
      },
    });
    relate(item.person, id(item.n), 'Physical description');
  }

  const events = [
    { n: 641, case: id(CASE.VG0150), activity: 'Zeugenvernehmung', when: '2026-02-08T10:00:00', detail: 'Sandra Schwarz' },
    { n: 642, case: id(CASE.VG0188), activity: 'Asservierung', when: '2026-04-21T09:30:00', detail: 'Drogen sichergestellt' },
    { n: 643, case: id(CASE.VG0210), activity: 'Spurensicherung', when: '2026-05-06T07:45:00', detail: 'Lagerhalle' },
    { n: 644, case: CASE_0124, activity: 'Observation', when: '2026-05-21T20:15:00', detail: 'Café Münchner Freiheit' },
  ];

  for (const item of events) {
    addEntity({
      id: id(item.n),
      type: 'Case Event',
      attributes: {
        VORGANG_ID: item.case,
        AKTIVITAET: item.activity,
        ZEITSTEMPEL: item.when,
        DETAIL: item.detail,
      },
    });
    relate(item.case, id(item.n), 'Case event');
  }

  mock.entities.push(...extraEntities);
  mock.relations.push(...extraRelations);
})();
