import { getCustomerDetails } from "../services/customerService.js";
import { AppError } from "../utils/appError.js";

export async function getCustomerDetailsApi(req, res) {
  const customer = await getCustomerDetails(req.params.id);
  return res.json({ customer });
}

export async function renderCustomerDetails(req, res) {
  try {
    const customer = await getCustomerDetails(req.params.id);

    return res.render("pages/customer", {
      pageId: "customer",
      title: customer.name,
      customer,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).render("pages/not-found", {
        pageId: "not-found",
        title: res.locals.t("notFound.title"),
      });
    }

    throw error;
  }
}
