const { MercadoPagoConfig, Payment } = require('mercadopago');
const axios = require('axios');

// Inicializa el objeto cliente de MercadoPago
const client = new MercadoPagoConfig({
    accessToken: MERCADOPAGO_ACCESS_TOKEN
});

// Función para manejar webhooks de Monday.com y generar link de pago
exports.generarLinkPago = async (req, res) => {
    try {
        console.log("Inicio de la función");

        if (!req.body || !req.body.event || !req.body.event.pulseId) {
            throw new Error('La solicitud no contiene la estructura esperada de un evento de Monday.com');
        }

        const itemId = req.body.event.pulseId;

        const query = `query {
            items(ids: [${itemId}]) {
                column_values {
                    id
                    type
                    value
                    text
                }
            }
        }`;

        let mondayResponse = await axios.post('https://api.monday.com/v2', {
            query: query
        }, {
            headers: {
                'Authorization': MONDAY_API_TOKEN,
                'Content-Type': 'application/json'
            }
        });

        console.log("Respuesta de Monday.com:", mondayResponse.data);

        const columnsData = mondayResponse.data.data.items[0].column_values;

        const montoColumn = columnsData.find(column => column.id === 'n_meros03');
        const descripcionColumn = columnsData.find(column => column.id === 'ubicaci_n');
        const emailColumn = columnsData.find(column => column.id === 'correo_electr_nico');

        if (!montoColumn || !descripcionColumn || !emailColumn) {
            throw new Error('Datos necesarios no están presentes en el evento');
        }

        const monto = parseFloat(montoColumn.text);
        const descripcion = descripcionColumn.text;
        const email = emailColumn.text;

        console.log(monto)
        console.log(descripcion)
        console.log(email)

        // Inicializa el objeto API de pago
        const payment = new Payment(client);
        const montoFinal = monto * 1; // Calcula el monto total

        const preference = {
            items: [{
                title: descripcion,
                quantity: 1,
                currency_id: 'CLP',
                unit_price: monto,
            }],
            payer: { email: email },
            payment_methods: {
                excluded_payment_methods: [],
                excluded_payment_types: [],
                installments: 6, // Ejemplo: Número de cuotas
            transaction_amount: montoFinal, // Utiliza la variable montoFinal

            },
            // Otros campos y configuraciones necesarios...
        };
        console.log(preference)
        console.log(montoFinal)
        
        // Realiza la solicitud para crear la preferencia de pago
        let preferenceResponse = await payment.create(preference);
        let preferenceId = preferenceResponse.body.id;
        console.log(preferenceResponse)

        // Construir el enlace de MercadoPago utilizando el preferenceId
        const linkDePago = `https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=${preferenceId}`;

        await axios.post('https://api.monday.com/v2/', {
            query: `mutation { 
                change_column_value (board_id: 5598495616, item_id: ${itemId}, column_id: "enlace", value: "{\"url\": \"${linkDePago}\"}") { 
                    id 
                } 
            }`
        }, {
            headers: {
                'Authorization': MONDAY_API_TOKEN,
                'Content-Type': 'application/json'
            }
        });

        res.json({ mensaje: "Link de pago generado y actualizado en Monday.com", linkDePago: linkDePago });
    } catch (error) {
        console.error('Error capturado en la función:', error);
        res.status(500).json({ mensaje: "Error en la función", error: error.message, stack: error.stack });
    }
};
