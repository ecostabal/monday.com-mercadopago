const { MercadoPagoConfig, Payment } = require('mercadopago');
const axios = require('axios');

// Configuración de MercadoPago con token de prueba
const client = new MercadoPagoConfig({
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN
});
const payment = new Payment(client);

// Función para manejar webhooks de Monday.com y generar link de pago
exports.generarLinkPago = async (req, res) => {
    try {
        console.log("Inicio de la función");

        // Agrega el registro de la solicitud recibida
        console.log("Solicitud recibida:", JSON.stringify(req.body, null, 2));
        
        // Verificar la estructura de la solicitud
        if (!req.body || !req.body.event || !req.body.event.pulse || !req.body.event.pulse.column_values) {
            throw new Error('La solicitud no contiene la estructura esperada de un evento de Monday.com');
        }

        const eventData = req.body.event;
        const columnsData = eventData.pulse.column_values;

        // Obtener los valores de las columnas por ID de columna
        const montoColumn = columnsData.find(column => column.id === 'f_rmula0');
        const descripcionColumn = columnsData.find(column => column.id === 'ubicaci_n');
        const emailColumn = columnsData.find(column => column.id === 'correo_electr_nico');

        if (!montoColumn || !descripcionColumn || !emailColumn) {
            throw new Error('Datos necesarios no están presentes en el evento');
        }

        // Convertir el valor de la columna "Monto" a número
        const monto = parseFloat(montoColumn.text);
        const descripcion = descripcionColumn.text;
        const email = emailColumn.text;

        console.log("Monto:", monto, "Descripción:", descripcion, "Email:", email);

        // Crear el link de pago
        const paymentResponse = await payment.create({
            body: {
                transaction_amount: monto,
                description: descripcion,
                payer: {
                    email: email
                }
            }
        });

        console.log("Respuesta de Mercado Pago:", paymentResponse);

        const linkDePago = paymentResponse.response.point_of_interaction.transaction_data.ticket_url;
        console.log("Link de pago:", linkDePago);

        // Actualizar la columna de enlace en Monday.com con el link de pago
        const updateResponse = await axios.post('https://api.monday.com/v2/', {
            query: `mutation { 
                change_column_value (board_id: 5598495616, item_id: ${eventData.pulse.id}, column_id: "enlace", value: "{\"url\": \"${linkDePago}\"}") { 
                    id 
                } 
            }`
        }, {
            headers: {
                'Authorization': process.env.MONDAY_API_TOKEN
            }
        });

        console.log("Respuesta de la actualización en Monday.com:", updateResponse);

        res.json({ mensaje: "Link de pago generado y actualizado en Monday.com" });
    } catch (error) {
        console.error('Error capturado en la función:', error);
        res.status(500).json({ mensaje: "Error en la función", error: error.message, stack: error.stack });
    }
};
