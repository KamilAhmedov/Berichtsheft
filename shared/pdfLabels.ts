import type { DayKind, Language } from './types'

/**
 * Beschriftungen für den PDF-Ausdruck. Bewusst in `shared/`, weil das PDF im
 * Hauptprozess erzeugt wird und dort die i18n-Dateien des Renderers fehlen.
 *
 * Die deutschen Texte übernehmen die Wortwahl der IHK-Vordrucke. Englisch und
 * Türkisch sind Übersetzungen davon — für die Abgabe zählt die deutsche Fassung.
 */
export interface PdfLabels {
  title: string
  subtitleWeekly: string
  subtitleDaily: string

  traineeName: string
  trainingYear: string
  trainingArea: string
  weekFrom: string
  until: string

  blockCompany: string
  blockUnits: string
  blockSchool: string

  hours: string
  total: string
  day: string
  activity: string
  kind: string
  dayKinds: Record<DayKind, string>

  signTrainee: string
  signTrainer: string
  signGuardian: string
  signOther: string

  noEntries: string
}

export const PDF_LABELS: Record<Language, PdfLabels> = {
  de: {
    title: 'Ausbildungsnachweis (Berichtsheft)',
    subtitleWeekly: '– wöchentlich –',
    subtitleDaily: '– täglich –',

    traineeName: 'Name des/der Auszubildenden',
    trainingYear: 'Ausbildungsjahr',
    trainingArea: 'Ausbildungsbereich',
    weekFrom: 'Ausbildungswoche vom',
    until: 'bis',

    blockCompany: 'Betriebliche Tätigkeiten',
    blockUnits: 'Unterweisungen, betrieblicher Unterricht, sonstige Schulungen',
    blockSchool: 'Themen des Berufsschulunterrichts',

    hours: 'Stunden',
    total: 'Gesamt',
    day: 'Tag',
    activity: 'Tätigkeit',
    kind: 'Art',
    dayKinds: {
      company: 'Betrieb',
      school: 'Berufsschule',
      vacation: 'Urlaub',
      sick: 'Krank',
      holiday: 'Feiertag',
      off: 'Frei',
    },

    signTrainee: 'Datum, Unterschrift Auszubildende/r',
    signTrainer: 'Datum, Unterschrift Ausbildende/r oder Ausbilder/in',
    signGuardian: 'Datum, Unterschrift gesetzliche/r Vertreter/in',
    signOther: 'ggf. weitere Sichtvermerke (z. B. Arbeitnehmervertreter)',

    noEntries: 'Keine Einträge im gewählten Zeitraum.',
  },

  en: {
    title: 'Ausbildungsnachweis (Training Record)',
    subtitleWeekly: '– weekly –',
    subtitleDaily: '– daily –',

    traineeName: 'Name of trainee',
    trainingYear: 'Training year',
    trainingArea: 'Training area',
    weekFrom: 'Training week from',
    until: 'to',

    blockCompany: 'Work in the company',
    blockUnits: 'Instruction, in-house lessons, other training',
    blockSchool: 'Topics covered at vocational school',

    hours: 'Hours',
    total: 'Total',
    day: 'Day',
    activity: 'Activity',
    kind: 'Type',
    dayKinds: {
      company: 'Company',
      school: 'School',
      vacation: 'Holiday leave',
      sick: 'Sick',
      holiday: 'Public holiday',
      off: 'Day off',
    },

    signTrainee: 'Date, signature of trainee',
    signTrainer: 'Date, signature of employer or trainer',
    signGuardian: 'Date, signature of legal guardian',
    signOther: 'Further endorsements if applicable (e.g. works council)',

    noEntries: 'No entries in the selected period.',
  },

  tr: {
    title: 'Ausbildungsnachweis (Eğitim kayıt defteri)',
    subtitleWeekly: '– haftalık –',
    subtitleDaily: '– günlük –',

    traineeName: 'Öğrencinin adı',
    trainingYear: 'Eğitim yılı',
    trainingArea: 'Eğitim alanı',
    weekFrom: 'Eğitim haftası',
    until: 'bitiş',

    blockCompany: 'Firmadaki çalışmalar',
    blockUnits: 'Eğitimler, firma içi dersler, diğer kurslar',
    blockSchool: 'Meslek okulunda işlenen konular',

    hours: 'Saat',
    total: 'Toplam',
    day: 'Gün',
    activity: 'Yapılan iş',
    kind: 'Tür',
    dayKinds: {
      company: 'Firma',
      school: 'Meslek okulu',
      vacation: 'İzin',
      sick: 'Raporlu',
      holiday: 'Resmi tatil',
      off: 'Tatil',
    },

    signTrainee: 'Tarih, öğrenci imzası',
    signTrainer: 'Tarih, işveren veya eğitmen imzası',
    signGuardian: 'Tarih, yasal vasi imzası',
    signOther: 'Varsa diğer onaylar (ör. işçi temsilcisi)',

    noEntries: 'Seçilen dönemde kayıt yok.',
  },
}

export const PDF_LOCALE: Record<Language, string> = {
  de: 'de-DE',
  en: 'en-GB',
  tr: 'tr-TR',
}
