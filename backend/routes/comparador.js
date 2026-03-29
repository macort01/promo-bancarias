const express = require("express");
const router = express.Router();
const { buscarEnSEPA } = require("../services/sepaService");

router.get("/buscar", async (req, res) => {
  try {
    const query = (req.query.query || "").toLowerCase().trim();

    if (!query) {
      return res.json({
        success: true,
        total: 0,
        data: []
      });
    }

    let resultados = [];

    try {
      resultados = await buscarEnSEPA(query);
    } catch (err) {
      console.error("Error SEPA:", err.message);

      resultados = [
        {
          nombre: "Producto no disponible",
          precio: 0,
          comercio: "Sin datos",
          nota: "No se pudo consultar SEPA"
        }
      ];
    }

    return res.json({
      success: true,
      total: resultados.length,
      data: resultados
    });

  } catch (error) {
    console.error("Error general comparador:", error);

    return res.status(200).json({
      success: false,
      error: "No se pudo procesar la búsqueda",
      data: []
    });
  }
});

module.exports = router;
