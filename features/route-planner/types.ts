export type StopStatus = 'pending' | 'complete';

export type Stop = {
  id: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
  label?: string;
  status?: StopStatus;
  sortOrder?: number | null;
};
