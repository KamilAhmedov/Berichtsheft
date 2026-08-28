import type { DayKind, Language } from './types'

/**
 * Beschriftungen für den PDF-Ausdruck. Bewusst in `shared/`, weil das PDF im
 * Hauptprozess erzeugt wird und dort die i18n-Dateien des Renderers fehlen.
 *
 * Die deutschen Texte folgen der Wortwahl der IHK-Vordrucke, damit der
 * Ausdruck neben dem amtlichen Formular nicht auffällt. Englisch und Türkisch
 * sind Übersetzungen davon — für die Abgabe bei der IHK zählt die deutsche
 * Fassung.
 */
export interface PdfLabels {
  title: string
  subtitleWeekly: string
  subtitleDaily: string

  // Deckblatt
  coverBookNumber: string
  coverName: string
  coverAddress: string
  coverOccupation: string
  coverSpecialization: string
  coverCompany: string
  coverTrainer: string
  coverStart: string
  coverEnd: string
  coverNoteTitle: string
  coverNote: string

  // Kopf des Wochenblatts
  traineeName: string
  trainingYear: string
  trainingArea: string
  weekFrom: string
  until: string

  // Blöcke — Reihenfolge und Wortlaut wie im Vordruck
  blockCompany: string
  blockUnits: string
  blockSchool: string

  hours: string
  total: string
  day: string
  date: string
  kind: string
  dayKinds: Record<DayKind, string>

  signTrainee: string
  signTrainer: string
  signOther: string

  noEntries: string
}

export const PDF_LABELS: Record<Language, PdfLabels> = {
  de: {
    title: 'Ausbildungsnachweis',
    subtitleWeekly: 'wöchentlich',
    subtitleDaily: 'täglich',

    coverBookNumber: 'Heft-Nr.',
    coverName: 'Name, Vorname',
    coverAddress: 'Adresse',
    coverOccupation: 'Ausbildungsberuf',
    coverSpecialization: 'Fachrichtung/Schwerpunkt',
    coverCompany: 'Ausbildungsbetrieb',
    coverTrainer: 'Verantwortliche/r Ausbilder/in',
    coverStart: 'Beginn der Ausbildung',
    coverEnd: 'Ende der Ausbildung',
    coverNoteTitle: 'Hinweise',
    coverNote:
      'Der ordnungsgemäß geführte Ausbildungsnachweis ist Zulassungsvoraussetzung zur Abschlussprüfung gemäß § 43 Abs. 1 Nr. 2 BBiG. Jedes Blatt ist mit dem Namen der/des Auszubildenden, dem Ausbildungsjahr und dem Berichtszeitraum zu versehen. Der Nachweis muss mindestens stichwortartig den Inhalt der betrieblichen Ausbildung wiedergeben; betriebliche Tätigkeiten, Unterweisungen und die Themen des Berufsschulunterrichts sind aufzunehmen.',

    traineeName: 'Name des/der Auszubildenden',
    trainingYear: 'Ausbildungsjahr',
    trainingArea: 'Ausbildungsbereich',
    weekFrom: 'Ausbildungswoche vom',
    until: 'bis',

    blockCompany: 'Betriebliche Tätigkeiten',
    blockUnits: 'Ausbildungseinheiten, betrieblicher Unterricht, sonstige Schulungen',
    blockSchool: 'Themen des Berufsschulunterrichts',

    hours: 'Stunden',
    total: 'Gesamt',
    day: 'Tag',
    date: 'Datum',
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
    signOther: 'Datum, weitere Sichtvermerke (z. B. Ausbildungsbeauftragte)',

    noEntries: 'Keine Einträge im gewählten Zeitraum.',
  },

  en: {
    title: 'Training Record',
    subtitleWeekly: 'weekly',
    subtitleDaily: 'daily',

    coverBookNumber: 'Booklet no.',
    coverName: 'Surname, first name',
    coverAddress: 'Address',
    coverOccupation: 'Occupation',
    coverSpecialization: 'Specialisation / focus',
    coverCompany: 'Training company',
    coverTrainer: 'Responsible trainer',
    coverStart: 'Start of training',
    coverEnd: 'End of training',
    coverNoteTitle: 'Notes',
    coverNote:
      'A properly kept training record is a precondition for admission to the final examination under § 43 (1) no. 2 BBiG. Every sheet must carry the trainee name, the training year and the reporting period. The record must state, at least in keywords, the content of the in-company training; company activities, instruction units and the topics covered at vocational school are to be included.',

    traineeName: 'Name of trainee',
    trainingYear: 'Training year',
    trainingArea: 'Training area',
    weekFrom: 'Training week from',
    until: 'to',

    blockCompany: 'Work in the company',
    blockUnits: 'Instruction units, in-house lessons, other training',
    blockSchool: 'Topics covered at vocational school',

    hours: 'Hours',
    total: 'Total',
    day: 'Day',
    date: 'Date',
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
    signOther: 'Date, further endorsements (e.g. training officer)',

    noEntries: 'No entries in the selected period.',
  },

  tr: {
    title: 'Ausbildungsnachweis',
    subtitleWeekly: 'haftalık',
    subtitleDaily: 'günlük',

    coverBookNumber: 'Defter no.',
    coverName: 'Soyadı, adı',
    coverAddress: 'Adres',
    coverOccupation: 'Meslek',
    coverSpecialization: 'Uzmanlık alanı',
    coverCompany: 'Eğitim veren firma',
    coverTrainer: 'Sorumlu eğitmen',
    coverStart: 'Eğitimin başlangıcı',
    coverEnd: 'Eğitimin bitişi',
    coverNoteTitle: 'Açıklamalar',
    coverNote:
      'Usulüne uygun tutulmuş eğitim kayıt defteri, BBiG § 43 f. 1 no. 2 uyarınca bitirme sınavına girmenin ön şartıdır. Her sayfada öğrencinin adı, eğitim yılı ve rapor dönemi bulunmalıdır. Defter, firmadaki eğitimin içeriğini en azından anahtar kelimelerle yansıtmalı; firmadaki çalışmalar, verilen eğitimler ve meslek okulunda işlenen konular yer almalıdır.',

    traineeName: 'Öğrencinin adı',
    trainingYear: 'Eğitim yılı',
    trainingArea: 'Eğitim alanı',
    weekFrom: 'Eğitim haftası',
    until: '—',

    blockCompany: 'Firmadaki çalışmalar',
    blockUnits: 'Eğitim birimleri, firma içi dersler, diğer kurslar',
    blockSchool: 'Meslek okulunda işlenen konular',

    hours: 'Saat',
    total: 'Toplam',
    day: 'Gün',
    date: 'Tarih',
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
    signOther: 'Tarih, diğer onaylar (ör. eğitim sorumlusu)',

    noEntries: 'Seçilen dönemde kayıt yok.',
  },
}

export const PDF_LOCALE: Record<Language, string> = {
  de: 'de-DE',
  en: 'en-GB',
  tr: 'tr-TR',
}
