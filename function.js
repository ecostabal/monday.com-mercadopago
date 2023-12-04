const axios = require('axios');
const CryptoJS = require('crypto-js');

// Configuración de Flow
const flowConfig = {
    apiKey: '26FF859D-5E21-4E57-9BBD-7D0BAD8L06CC', // Reemplaza con tu API Key de Flow
    secretKey: '3756483e4e45238c83a7fb6112a4aba948f83728', // Reemplaza con tu Secret Key de Flow
    // ...otros parámetros de configuración...
};

// Función para firmar los parámetros con secretKey
const firmarParametros = (parametros, secretKey) => {
    const stringToSign = Object.keys(parametros)
        .sort()
        .map(key => key + parametros[key])
        .join('');

    // Utiliza el algoritmo SHA-256 y tu secretKey para firmar
    const signature = CryptoJS.HmacSHA256(stringToSign, secretKey).toString(CryptoJS.enc.Hex);

    return signature;
};

// Función para manejar webhooks de Monday.com y generar link de pago con Flow
exports.generarLinkPagoFlow = async (req, res) => {
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
                'Authorization': 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjIzMjg3MzUyNCwiYWFpIjoxMSwidWlkIjoyMzUzNzM2NCwiaWFkIjoiMjAyMy0wMS0zMVQyMTowMjoxNy4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6OTUwNzUxNiwicmduIjoidXNlMSJ9.lX1RYu90B2JcH0QxITaF8ymd4d6dBes0FJHPI1mzSRE',
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
        if (isNaN(monto)) {
            throw new Error('El monto no es un número válido');
        }

        const descripcion = descripcionColumn.text;
        const email = emailColumn.text;

        // Creación de la orden de pago para Flow
        const ordenCobro = {
            apiKey: flowConfig.apiKey,
            subject: descripcion,
            currency: 'CLP',
            amount: monto,
            email: email,
            paymentMethod: 9,

        };

        // Firma de los parámetros con tu secretKey de Flow
        ordenCobro.s = firmarParametros(ordenCobro, flowConfig.secretKey);


        // Envío de la orden de pago a Flow
        let flowResponse = await axios.post('https://www.flow.cl/api/payment/create', ordenCobro, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                // Aquí debes incluir cualquier otra cabecera necesaria, como autenticación
            }
        });

        if (!flowResponse.data || !flowResponse.data.token) {
            throw new Error('No se pudo obtener el token de pago de Flow');
        }

        const token = flowResponse.data.token;

        // Construir la URL de redirección
        const urlRedireccion = `sandbox.flow.cl/app/web/pay.php?token=${token}`; // Reemplaza con tu URL de redirección

        // Actualizar el enlace en Monday.com
        await axios.post('https://api.monday.com/v2/', {
            query: `mutation { 
                change_column_value (board_id: 5598495616, item_id: ${itemId}, column_id: "enlace", value: "{\"url\": \"${urlRedireccion}\"}") { 
                    id 
                } 
            }`
        }, {
            headers: {
                'Authorization': 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjIzMjg3MzUyNCwiYWFpIjoxMSwidWlkIjoyMzUzNzM2NCwiaWFkIjoiMjAyMy0wMS0zMVQyMTowMjoxNy4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6OTUwNzUxNiwicmduIjoidXNlMSJ9.lX1RYu90B2JcH0QxITaF8ymd4d6dBes0FJHPI1mzSRE',
                'Content-Type': 'application/json'
            }
        });

        res.json({ mensaje: "Link de pago generado y actualizado en Monday.com", linkDePago: urlRedireccion });
    } catch (error) {
        console.error('Error capturado en la función:', error);
        res.status(500).json({ mensaje: "Error en la función", error: error.message, stack: error.stack });
    }
};
