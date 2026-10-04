import type { Bill, BillInput, Dashboard, Home } from "./schemas";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface Api {
  listHomes(): Promise<Home[]>;
  listBills(homeId: string): Promise<Bill[]>;
  getBill(homeId: string, billId: string): Promise<Bill>;
  createBill(homeId: string, input: BillInput): Promise<Bill>;
  updateBill(homeId: string, billId: string, input: BillInput): Promise<Bill>;
  deleteBill(homeId: string, billId: string): Promise<void>;
  getDashboard(homeId: string): Promise<Dashboard>;
}
