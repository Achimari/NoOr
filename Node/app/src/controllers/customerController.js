import { getCustomerDetails } from "../services/customerService.js";

export async function getCustomerDetailsApi(req, res) {
  const customer = await getCustomerDetails(req.params.id);
  return res.json({ customer });
}
