export async function getCurrentUser(req, res) {
  res.json({ user: req.user });
}
