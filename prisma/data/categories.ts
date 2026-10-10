export interface CategorySeed {
  name: string;
  nameBn: string;
  slug: string;
}

export const DEFAULT_CATEGORIES: CategorySeed[] = [
  { name: "Indoor Plants", nameBn: "ইনডোর গাছ", slug: "indoor-plants" },
  { name: "Outdoor Plants", nameBn: "আউটডোর গাছ", slug: "outdoor-plants" },
  { name: "Flowering Plants", nameBn: "ফুলের গাছ", slug: "flowering-plants" },
  { name: "Fruit Plants", nameBn: "ফলের গাছ", slug: "fruit-plants" },
  { name: "Herbs & Medicinal", nameBn: "ভেষজ ও ঔষধি", slug: "herbs-medicinal" },
  { name: "Succulents & Cactus", nameBn: "সাকুলেন্ট ও ক্যাকটাস", slug: "succulents-cactus" },
  { name: "Bonsai", nameBn: "বনসাই", slug: "bonsai" },
  { name: "Seeds", nameBn: "বীজ", slug: "seeds" },
  { name: "Pots & Planters", nameBn: "পট ও প্লান্টার", slug: "pots-planters" },
  { name: "Soil & Fertilizer", nameBn: "মাটি ও সার", slug: "soil-fertilizer" },
  { name: "Gardening Tools", nameBn: "বাগান সরঞ্জাম", slug: "gardening-tools" },
];
