export interface ExtractedConstraints {
  total_award: number;
  category_caps?: {
    [category: string]: {
      amount: number;
      percentage?: number;
    };
  };
  kpi_targets?: {
    [key: string]: {
      target: number;
      deadline?: string;
    };
  };
  reporting_deadlines?: {
    report_type: string;
    due_date: string;
  }[];
  restricted_categories?: string[];
  amendments?: unknown[];
}
