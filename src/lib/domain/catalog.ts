import { BookGenre, PassageSample } from '../types';

export interface CatalogBookSeed {
  catalogId: string;
  title: string;
  author: string;
  isbn: string;
  genre: BookGenre[];
  subgenre: string[];
  page_count: number;
  word_count_estimate: number;
  difficulty_band: 1 | 2 | 3 | 4 | 5;
  cover_color: string;
  description: string;
  source: 'OpenLibrary' | 'GoogleBooks';
  sample_passages: PassageSample[];
}

export const CATALOG_BOOKS: CatalogBookSeed[] = [
  {
    catalogId: 'cat-ddia',
    title: 'Designing Data-Intensive Applications',
    author: 'Martin Kleppmann',
    isbn: '9781449373320',
    genre: ['technical', 'reference'],
    subgenre: ['Distributed Systems', 'Database Internals'],
    page_count: 616,
    word_count_estimate: 208000,
    difficulty_band: 5,
    cover_color: '#134e4a',
    description:
      'Foundational engineering guide examining replication, partitioning, consensus, batch and stream processing trade-offs in modern data systems.',
    source: 'OpenLibrary',
    sample_passages: [
      {
        pageStart: 1,
        pageEnd: 200,
        excerpt:
          'Reliability means continuing to work correctly even when faults occur in hardware, software, or human operations across distributed nodes.',
        question: {
          prompt: 'According to the passage, what defines reliability in distributed nodes?',
          options: [
            'Eliminating every possible hardware fault before deployment',
            'Continuing to work correctly even when hardware, software, or human faults occur',
            'Scaling read throughput linearly without replication',
          ],
          correctIndex: 1,
          explanation:
            'The excerpt states reliability means continuing to work correctly even when faults occur in hardware, software, or human operations.',
        },
      },
      {
        pageStart: 201,
        pageEnd: 616,
        excerpt:
          'Single-leader replication directs all writes to a designated primary node, which streams a replication log of data changes to follower replicas.',
        question: {
          prompt: 'Where are writes sent in single-leader replication?',
          options: [
            'To any nearest follower replica',
            'To a designated primary node that streams a replication log to followers',
            'Directly to client-side local storage only',
          ],
          correctIndex: 1,
          explanation:
            'All writes go to a designated primary node, which streams the replication log to follower replicas.',
        },
      },
    ],
  },
  {
    catalogId: 'cat-thinking-fast-slow',
    title: 'Thinking, Fast and Slow',
    author: 'Daniel Kahneman',
    isbn: '9780374533557',
    genre: ['academic', 'general_nonfiction'],
    subgenre: ['Cognitive Psychology', 'Behavioral Economics'],
    page_count: 499,
    word_count_estimate: 178000,
    difficulty_band: 4,
    cover_color: '#7c2d12',
    description:
      'Exploration of dual-process cognition: rapid intuitive heuristics alongside deliberate analytical reasoning and statistical biases.',
    source: 'OpenLibrary',
    sample_passages: [
      {
        pageStart: 1,
        pageEnd: 499,
        excerpt:
          'Fast intuitive impressions operate automatically with little sense of voluntary control, while deliberate reasoning allocates effortful attention to complex computations.',
        question: {
          prompt: 'What does deliberate reasoning allocate according to the passage?',
          options: [
            'Effortful attention to complex computations',
            'Automatic impressions without voluntary control',
            'Purely sensory memory traces',
          ],
          correctIndex: 0,
          explanation:
            'The passage contrasts automatic intuitive impressions with deliberate reasoning allocating effortful attention to complex computations.',
        },
      },
    ],
  },
  {
    catalogId: 'cat-meditations',
    title: 'Meditations',
    author: 'Marcus Aurelius (trans. Gregory Hays)',
    isbn: '9780812968255',
    genre: ['philosophy', 'religious'],
    subgenre: ['Stoicism', 'Contemplative Ethics'],
    page_count: 254,
    word_count_estimate: 66000,
    difficulty_band: 4,
    cover_color: '#3b0764',
    description:
      'Private philosophical notebooks written on campaign, reflecting on transience, civic duty, composure, and inward discipline.',
    source: 'OpenLibrary',
    sample_passages: [
      {
        pageStart: 1,
        pageEnd: 254,
        excerpt:
          'You have power over your mind and your own judgments, not outside events; realize this, and you will recover steady composure.',
        question: {
          prompt: 'Over what does the passage say you hold power?',
          options: [
            'Outside events and fortune',
            'Your mind and your own judgments',
            'The opinions of crowds in the forum',
          ],
          correctIndex: 1,
          explanation:
            'The passage explicitly notes you have power over your mind and your own judgments, not outside events.',
        },
      },
    ],
  },
  {
    catalogId: 'cat-devotions-oliver',
    title: 'Devotions: The Selected Poems of Mary Oliver',
    author: 'Mary Oliver',
    isbn: '9780399563249',
    genre: ['poetry'],
    subgenre: ['Nature Lyric', 'Contemporary Verse'],
    page_count: 480,
    word_count_estimate: 58000,
    difficulty_band: 3,
    cover_color: '#1e3a8a',
    description:
      'Five decades of attentive lyric poetry observing marshes, shorebirds, solitude, mortality, and quiet gratitude.',
    source: 'GoogleBooks',
    sample_passages: [
      {
        pageStart: 1,
        pageEnd: 480,
        excerpt:
          'Instructions for living a life: pay close attention, be astonished by small morning things, and tell plainly about them.',
        question: {
          prompt: 'Which three actions are named in these instructions?',
          options: [
            'Hurry forward, accumulate praise, and guard secrets',
            'Pay close attention, be astonished, and tell plainly about them',
            'Study maps, cross oceans, and build monuments',
          ],
          correctIndex: 1,
          explanation:
            'The lines instruct the reader to pay close attention, be astonished by small morning things, and tell plainly about them.',
        },
      },
    ],
  },
  {
    catalogId: 'cat-confessions',
    title: 'Confessions',
    author: 'Augustine of Hippo (trans. Sarah Ruden)',
    isbn: '9780812986488',
    genre: ['religious', 'philosophy'],
    subgenre: ['Patristics', 'Spiritual Autobiography'],
    page_count: 464,
    word_count_estimate: 138000,
    difficulty_band: 5,
    cover_color: '#713f12',
    description:
      'Fourth-century spiritual and philosophical inquiry into memory, time, restlessness, rhetoric, and grace.',
    source: 'OpenLibrary',
    sample_passages: [
      {
        pageStart: 1,
        pageEnd: 464,
        excerpt:
          'Vast are the halls of memory where countless images brought in from perceived things are stored and retrieved in quiet reflection.',
        question: {
          prompt: 'What is stored in the halls of memory in this passage?',
          options: [
            'Countless images brought in from perceived things',
            'Astronomical tables of future eclipses',
            'Written imperial edicts of Rome',
          ],
          correctIndex: 0,
          explanation:
            'The excerpt describes countless images brought in from perceived things stored in the halls of memory.',
        },
      },
    ],
  },
  {
    catalogId: 'cat-remains-of-day',
    title: 'The Remains of the Day',
    author: 'Kazuo Ishiguro',
    isbn: '9780679731726',
    genre: ['literary_fiction'],
    subgenre: ['Historical Literary', 'Character Study'],
    page_count: 258,
    word_count_estimate: 74000,
    difficulty_band: 3,
    cover_color: '#312e81',
    description:
      'An English butler motoring across West Country villages reckons with dignity, restraint, memory, and unspoken devotion.',
    source: 'OpenLibrary',
    sample_passages: [
      {
        pageStart: 1,
        pageEnd: 258,
        excerpt:
          'Evening is often the finest hour of the day, when the lamps come on along the pier and one reflects without haste.',
        question: {
          prompt: 'Why is evening highlighted in this excerpt?',
          options: [
            'It is when morning deliveries arrive at the manor',
            'Lamps come on along the pier and one reflects without haste',
            'The motorcar journey begins before sunrise',
          ],
          correctIndex: 1,
          explanation:
            'The excerpt remarks on the lamps coming on along the pier and reflecting without haste.',
        },
      },
    ],
  },
  {
    catalogId: 'cat-piranesi',
    title: 'Piranesi',
    author: 'Susanna Clarke',
    isbn: '9781635575637',
    genre: ['fiction', 'literary_fiction'],
    subgenre: ['Speculative Literary', 'Mystery'],
    page_count: 272,
    word_count_estimate: 69000,
    difficulty_band: 2,
    cover_color: '#0f766e',
    description:
      'A careful chronicler records tides, marble statues, and sea birds inside an infinite labyrinthine House.',
    source: 'OpenLibrary',
    sample_passages: [
      {
        pageStart: 1,
        pageEnd: 272,
        excerpt:
          'The beauty of the House is immeasurable; its kindness is infinite, providing shells, fish, and fresh rainwater in quiet vestibules.',
        question: {
          prompt: 'What does the House provide in its quiet vestibules?',
          options: [
            'Shells, fish, and fresh rainwater',
            'Printed newspapers and coal stoves',
            'Compasses and brass telescopes',
          ],
          correctIndex: 0,
          explanation: 'The passage names shells, fish, and fresh rainwater.',
        },
      },
    ],
  },
  {
    catalogId: 'cat-silk-roads',
    title: 'The Silk Roads: A New History of the World',
    author: 'Peter Frankopan',
    isbn: '9781101912379',
    genre: ['history', 'general_nonfiction'],
    subgenre: ['Global History', 'Trade Networks'],
    page_count: 656,
    word_count_estimate: 215000,
    difficulty_band: 4,
    cover_color: '#9a3412',
    description:
      'Sweeping history tracing how caravan routes across Central Asia, Persia, East Africa, and the Mediterranean shaped ideas, faiths, and empires.',
    source: 'OpenLibrary',
    sample_passages: [
      {
        pageStart: 1,
        pageEnd: 656,
        excerpt:
          'Along overland caravan corridors traveled not only silk and spices, but mathematical manuscripts, translations, languages, and religious traditions.',
        question: {
          prompt: 'Besides silk and spices, what traveled along the caravan corridors?',
          options: [
            'Steam locomotives and telegraph cables',
            'Mathematical manuscripts, translations, languages, and religious traditions',
            'Exclusively silver bullion from Atlantic ports',
          ],
          correctIndex: 1,
          explanation:
            'The excerpt lists mathematical manuscripts, translations, languages, and religious traditions.',
        },
      },
    ],
  },
  {
    catalogId: 'cat-elements-typographic',
    title: 'The Elements of Typographic Style',
    author: 'Robert Bringhurst',
    isbn: '9780881792126',
    genre: ['reference', 'technical'],
    subgenre: ['Typography', 'Book Design'],
    page_count: 398,
    word_count_estimate: 118000,
    difficulty_band: 3,
    cover_color: '#1f2937',
    description:
      'Definitive reference manual on rhythm, proportion, page geometry, optical spacing, and historical typefaces.',
    source: 'GoogleBooks',
    sample_passages: [
      {
        pageStart: 1,
        pageEnd: 398,
        excerpt:
          'Typography exists to honor content, giving durable visible form and balanced rhythm to human language on the printed page.',
        question: {
          prompt: 'What purpose does typography serve according to the passage?',
          options: [
            'To call maximum attention to decorative borders',
            'To honor content by giving durable visible form and balanced rhythm to language',
            'To compress as many characters as possible onto every line',
          ],
          correctIndex: 1,
          explanation:
            'Typography exists to honor content and give durable visible form and balanced rhythm to language.',
        },
      },
    ],
  },
  {
    catalogId: 'cat-phantom-tollbooth',
    title: 'The Phantom Tollbooth',
    author: 'Norton Juster',
    isbn: '9780394820378',
    genre: ['childrens', 'light_fiction'],
    subgenre: ['Wordplay Adventure', 'Classic Children'],
    page_count: 256,
    word_count_estimate: 46000,
    difficulty_band: 1,
    cover_color: '#0d9488',
    description:
      'Bored young Milo drives through a mysterious tollbooth into Dictionopolis and Digitopolis to rescue Rhyme and Reason.',
    source: 'OpenLibrary',
    sample_passages: [
      {
        pageStart: 1,
        pageEnd: 256,
        excerpt:
          'So many things are possible just as long as you do not assume ahead of time that they are impossible.',
        question: {
          prompt: 'When does the passage say many things are possible?',
          options: [
            'Only when you possess a royal map of Digitopolis',
            'As long as you do not assume ahead of time that they are impossible',
            'After counting to one thousand by sevens',
          ],
          correctIndex: 1,
          explanation:
            'The excerpt states many things are possible so long as you do not assume ahead of time that they are impossible.',
        },
      },
    ],
  },
  {
    catalogId: 'cat-project-hail-mary',
    title: 'Project Hail Mary',
    author: 'Andy Weir',
    isbn: '9780593135204',
    genre: ['light_fiction', 'fiction'],
    subgenre: ['Hard Sci-Fi', 'Adventure'],
    page_count: 476,
    word_count_estimate: 132000,
    difficulty_band: 2,
    cover_color: '#b45309',
    description:
      'A lone junior-high science teacher wakes aboard an interstellar vessel and solves survival puzzles through empirical experiments.',
    source: 'GoogleBooks',
    sample_passages: [
      {
        pageStart: 1,
        pageEnd: 476,
        excerpt:
          'Careful measurements with a stopwatch and pendulum revealed that the cabin acceleration was significantly stronger than Earth gravity.',
        question: {
          prompt: 'How was the cabin acceleration measured in the passage?',
          options: [
            'Using radar altimeters pointed at a planet',
            'With a stopwatch and pendulum',
            'By reading the ship main navigation console',
          ],
          correctIndex: 1,
          explanation: 'Measurements with a stopwatch and pendulum revealed the cabin acceleration.',
        },
      },
    ],
  },
  {
    catalogId: 'cat-structure-scientific',
    title: 'The Structure of Scientific Revolutions',
    author: 'Thomas S. Kuhn',
    isbn: '9780226458120',
    genre: ['academic', 'philosophy'],
    subgenre: ['Philosophy of Science', 'Epistemology'],
    page_count: 264,
    word_count_estimate: 78000,
    difficulty_band: 5,
    cover_color: '#881337',
    description:
      'Landmark monograph analyzing normal science, anomalies, crisis periods, and paradigm shifts across scientific history.',
    source: 'OpenLibrary',
    sample_passages: [
      {
        pageStart: 1,
        pageEnd: 264,
        excerpt:
          'Normal science investigates phenomena within an accepted conceptual paradigm until persistent anomalies provoke a crisis of method.',
        question: {
          prompt: 'What provokes a crisis of method in normal science according to the passage?',
          options: [
            'Routine textbook exercises',
            'Persistent anomalies that resist the accepted paradigm',
            'Decreases in laboratory equipment costs',
          ],
          correctIndex: 1,
          explanation:
            'Persistent anomalies provoke a crisis within the accepted conceptual paradigm.',
        },
      },
    ],
  },
  {
    catalogId: 'cat-braiding-sweetgrass',
    title: 'Braiding Sweetgrass',
    author: 'Robin Wall Kimmerer',
    isbn: '9781571313560',
    genre: ['general_nonfiction', 'academic'],
    subgenre: ['Botany', 'Ecological Essays'],
    page_count: 390,
    word_count_estimate: 124000,
    difficulty_band: 3,
    cover_color: '#166534',
    description:
      'Botanist and Citizen Potawatomi author weaves plant ecology, field observation, reciprocity, and indigenous wisdom.',
    source: 'OpenLibrary',
    sample_passages: [
      {
        pageStart: 1,
        pageEnd: 390,
        excerpt:
          'In an honorable harvest, one takes only what is generously given and tends the soil so the meadow flourishes next season.',
        question: {
          prompt: 'What principle characterizes an honorable harvest in this passage?',
          options: [
            'Clearing the entire meadow before autumn frost',
            'Taking only what is given and tending the soil so the meadow flourishes next season',
            'Planting only a single commercial crop variety',
          ],
          correctIndex: 1,
          explanation:
            'One takes only what is generously given and tends the soil so the meadow flourishes.',
        },
      },
    ],
  },
  {
    catalogId: 'cat-gilead',
    title: 'Gilead',
    author: 'Marilynne Robinson',
    isbn: '9780312424404',
    genre: ['literary_fiction', 'religious'],
    subgenre: ['Epistolary Novel', 'Contemplative Fiction'],
    page_count: 247,
    word_count_estimate: 76000,
    difficulty_band: 3,
    cover_color: '#4338ca',
    description:
      'An aging congregationalist pastor in 1956 Iowa writes a luminous letter to his young son reflecting on grace, family history, and ordinary light.',
    source: 'OpenLibrary',
    sample_passages: [
      {
        pageStart: 1,
        pageEnd: 247,
        excerpt:
          'Wherever you turn your eyes the world can shine like transfiguration; you do not have to bring moral grandeur to it.',
        question: {
          prompt: 'What observation does the narrator make about the world in this passage?',
          options: [
            'It shines like transfiguration wherever you turn your eyes',
            'Only distant capitals hold anything memorable',
            'Letters should never mention ordinary mornings',
          ],
          correctIndex: 0,
          explanation:
            'The passage observes that wherever you turn your eyes the world can shine like transfiguration.',
        },
      },
    ],
  },
];

export function searchCatalog(query: string, genreFilter?: BookGenre | 'all'): CatalogBookSeed[] {
  const q = query.trim().toLowerCase();
  return CATALOG_BOOKS.filter((item) => {
    const matchesGenre =
      !genreFilter || genreFilter === 'all' || item.genre.includes(genreFilter);
    if (!matchesGenre) return false;
    if (!q) return true;
    const cleanIsbn = q.replace(/[^0-9x]/gi, '');
    return (
      item.title.toLowerCase().includes(q) ||
      item.author.toLowerCase().includes(q) ||
      item.subgenre.some((s) => s.toLowerCase().includes(q)) ||
      (cleanIsbn.length >= 4 && item.isbn.includes(cleanIsbn))
    );
  });
}
