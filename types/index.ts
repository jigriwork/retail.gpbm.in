export type StoreBrand = "go-planet" | "brand-mark" | "mitty";

export type Store = {
  id: string;
  name: string;
  brand: StoreBrand;
};
