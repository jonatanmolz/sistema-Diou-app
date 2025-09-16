 const firebaseConfig = {
            apiKey: "AIzaSyCLb8BeZODM8vMynaIXINx4AN_P8snTBk8",
            authDomain: "sistemataloes.firebaseapp.com",
            projectId: "sistemataloes",
            storageBucket: "sistemataloes.appspot.com",
            messagingSenderId: "684534379685",
            appId: typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'
        };

        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
        import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
        import { getFirestore, doc, getDoc, collection, onSnapshot, updateDoc, query, where, or, and } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js"; 

        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app)

       
       
       // Elementos do Header e Navegação
        const menuNav = document.getElementById('menuNav');
        const userNameDisplay = document.getElementById('userNameDisplay');
        const userNivelDisplay = document.getElementById('userNivelDisplay');
        const logoutButton = document.getElementById('logoutButton');

        // Elementos do Scanner de Código de Barras
        const barcodeInputEntry = document.getElementById('barcodeInputEntry');
        const barcodeInputExit = document.getElementById('barcodeInputExit');
        const entryMessageDiv = document.getElementById('entryMessage');
        const exitMessageDiv = document.getElementById('exitMessage');
        const lastScannedEntryList = document.getElementById('lastScannedEntryList');
        const lastScannedExitList = document.getElementById('lastScannedExitList');
        const loadingMessageDiv = document.getElementById('loadingMessage');

        let allTaloes = []; 
        let currentUserEmail = '';
        let currentUserName = '';
        const lastEntries = [];
        const lastExits = [];
        const MAX_LAST_SCANNED = 5;
        let isDataLoaded = false;

    // Tipos de Usuarios e niveis
        const nivelNomes = {
            '01': 'Cadastro',
            '02': 'Corte',
            '03': 'Costura',
            '04': 'Montagem',
            '05': 'Admin',
            '06': 'Consultor',
            '07':'Super'

        };

        // Definição das páginas e seus níveis de acesso (copiado do index.html)
        const pages = [
          // Inicio
            { name: 'Index', href: 'index.html', levels: ['01','02','03', '04','05', '06','07'] },
          // Cadastro
            { name: 'Cadastro Usuarios', href: 'cadastroUsuarios.html', levels: ['07'] },
            { name: 'Cadastro Talões', href: 'cadastroTaloes.html', levels: ['01', '05','07'] },

          // Ferramentas
            { name: 'Romaneio', href: 'romaneio.html', levels: ['05','07'] },
            { name: 'Excluir Dados', href: 'excluirDados.html', levels: ['05','07'] },
            { name: 'Registro em Massa', href: 'registroEmMassa.html', levels: ['07'] },
          
          // Corte
            { name: 'Corte', href: 'corte.html', levels: ['02','07'] },
            { name: 'Relatório Erros', href: 'relatorioerros.html', levels: ['02','04','07'] },

          // Relatorios
            { name: 'Resumo', href: 'resumo.html', levels: ['04','06','07'] },
            { name: 'Cronograma', href: 'cronograma.html', levels: ['01','02', '04','05','06','07'] },
            { name: 'Cronograma Mobile', href: 'cronogramamobile.html', levels: ['06','07'] },
            { name: 'Relatório Master', href: 'relatorioMaster.html', levels: ['05','07'] },

          //Costura
            { name: 'Costura', href: 'costura.html', levels: ['03','07'] },
            { name: 'Relatorio Atelier', href: 'relatorioAtelier.html', levels: ['03','07'] },
            { name: 'Atlier Celular', href: 'relatoriomobile.html', levels: ['03','07'] },

          // Fabrica
            { name: 'Distribuição', href: 'distribuicao.html', levels: ['04','07'] },
            { name: 'Talonagem', href: 'talonagem.html', levels: ['04','07'] },
            { name: 'Montagem', href: 'montagem.html', levels: ['05','07'] }
            
        ];

    //Funçoes


        // Função para gerar o menu dinamicamente
        function generateMenu(userLevel, userName) {
            menuNav.innerHTML = '';
            const userNivelText = nivelNomes[userLevel] || `Nível ${userLevel}`;
            userNameDisplay.textContent = `Olá, ${userName || 'Usuário'}!`;
            userNivelDisplay.textContent = `Setor: ${userNivelText}`;

            pages.forEach(page => {
                if (page.levels.includes(userLevel)) {
                    const listItem = document.createElement('li');
                    const link = document.createElement('a');
                    link.href = page.href; 
                    link.textContent = page.name;
                    listItem.appendChild(link);
                    menuNav.appendChild(listItem);
                }
            });
        }

        // --- Controle de Autenticação e Carregamento de Dados ---
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUserEmail = user.email;
                const userDocRef = doc(db, 'Usuario', user.email);
                const userDocSnap = await getDoc(userDocRef);

                if (userDocSnap.exists()) {
                    const userData = userDocSnap.data();
                    const nivelAcesso = userData.nivelAcesso;
                    currentUserName = userData.Nome;

                    if (!pages.find(p => p.href === 'costura.html' && p.levels.includes(nivelAcesso))) {
                        alert('Você não tem permissão para acessar esta página.');
                        window.location.href = 'index.html';
                        return;
                    }

                    generateMenu(nivelAcesso, currentUserName);
                    listenToTaloes(); 
                } else {
                    alert('Dados do usuário não encontrados. Faça login novamente.');
                    await signOut(auth);
                    window.location.href = 'login.html';
                }
            } else {
                window.location.href = 'login.html';
            }
        });

        // --- Lógica de Logout ---
        logoutButton.addEventListener('click', async () => {
            try {
                await signOut(auth);
                window.location.href = 'login.html';
            } catch (error) {
                console.error("Erro ao fazer logout:", error);
                alert("Erro ao fazer logout. Tente novamente.");
            }
        });

        // --- Escutar Todos os Talões em Tempo Real ---
        function listenToTaloes() {
            const taloesColRef = collection(db, 'taloes'); 
            onSnapshot(taloesColRef, (snapshot) => {
                allTaloes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                // Habilita a interface de escaneamento após o primeiro carregamento
                if (!isDataLoaded) {
                    isDataLoaded = true;
                    loadingMessageDiv.style.display = 'none';
                    barcodeInputEntry.disabled = false;
                    barcodeInputExit.disabled = false;
                    barcodeInputEntry.focus(); // Coloca o foco no primeiro campo
                    console.log("Todos os talões carregados para scanner:", allTaloes);
                }
                
            }, (error) => {
                console.error("Erro ao escutar talões:", error);
            });
        }

        // --- Lógica para Atualizar Talão no Firebase ---
        async function updateTalaoInFirestore(talaoId, updates, messageDiv, barcode) {
            try {
                const talaoRef = doc(db, 'taloes', talaoId); 
                await updateDoc(talaoRef, updates);
                if (messageDiv) {
                    messageDiv.textContent = 'Sucesso!';
                    messageDiv.className = 'scanner-message success';
                }
                
                // Adiciona o código de barras à lista de últimos lidos
                if (messageDiv === entryMessageDiv) {
                    addLastScanned(lastEntries, barcode, lastScannedEntryList);
                } else if (messageDiv === exitMessageDiv) {
                    addLastScanned(lastExits, barcode, lastScannedExitList);
                }

                if (messageDiv) {
                    setTimeout(() => messageDiv.textContent = '', 3000);
                }
            } catch (error) {
                console.error(`Erro ao atualizar talão ${talaoId}:`, error);
                if (messageDiv) {
                    messageDiv.textContent = `Erro: ${error.message}`;
                    messageDiv.className = 'scanner-message error';
                    setTimeout(() => messageDiv.textContent = '', 5000);
                }
            }
        }

        // --- Função para adicionar e exibir os últimos códigos lidos ---
        function addLastScanned(listArray, barcode, displayElement) {
            // Adiciona o novo código no início do array
            listArray.unshift(barcode);
            // Mantém o tamanho máximo da lista
            if (listArray.length > MAX_LAST_SCANNED) {
                listArray.pop();
            }
            // Atualiza a exibição na interface
            displayElement.innerHTML = listArray.map(item => `<li>${item}</li>`).join('');
        }

        // --- Handler para Escaneamento de Entrada ---
        barcodeInputEntry.addEventListener('keypress', async (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();

                if (!isDataLoaded) {
                    entryMessageDiv.textContent = 'Aguarde o carregamento dos dados.';
                    entryMessageDiv.className = 'scanner-message error';
                    return;
                }

                let barcode = barcodeInputEntry.value.trim();

                // Lógica de transformação do código de barras
                if (barcode.length > 0 && barcode.charAt(0) !== '1') {
                    barcode = '1' + barcode.substring(1);
                }

                barcodeInputEntry.value = '';
                entryMessageDiv.textContent = 'Processando...';
                entryMessageDiv.className = 'scanner-message';

                if (!barcode) {
                    entryMessageDiv.textContent = 'Código de barras vazio.';
                    entryMessageDiv.className = 'scanner-message error';
                    return;
                }

                const talao = allTaloes.find(t => t.codigoBarrasIdentificador === barcode);

                if (!talao) {
                    entryMessageDiv.textContent = `Talão com código ${barcode} não encontrado.`;
                    entryMessageDiv.className = 'scanner-message error';
                    return;
                }
                
                // Lógica para registrar tentativa de escaneamento em ateliê errado
                if (talao.idAtelieResponsavel && talao.idAtelieResponsavel !== currentUserName) {
                    // Prepara o objeto de atualização com o novo campo
                    const updates = {
                        registroErrado: `${currentUserName} (${new Date().toISOString()})`
                    };
                    // Tenta atualizar o talão com o registro do erro
                    try {
                        await updateTalaoInFirestore(talao.id, updates, null, barcode); // 'null' para não exibir mensagem de sucesso
                    } catch (error) {
                        console.error("Erro ao registrar tentativa errada:", error);
                    }
                    
                    // Exibe a mensagem de erro para o usuário
                    entryMessageDiv.textContent = `Talão ${barcode} já atribuído a outro ateliê: ${talao.idAtelieResponsavel}.`;
                    entryMessageDiv.className = 'scanner-message error';
                    return;
                }
                
                if (talao.statusGeral === 'Finalizado' || talao.statusGeral === 'Costurado') {
                    entryMessageDiv.textContent = `Talão ${barcode} já foi finalizado/costurado. Status atual: ${talao.statusGeral}.`;
                    entryMessageDiv.className = 'scanner-message error';
                    return;
                }
                
                if (talao.idAtelieResponsavel === currentUserName && talao.statusCostura === 'Em Produção') {
                    entryMessageDiv.textContent = `Talão ${barcode} já está em produção no seu ateliê.`;
                    entryMessageDiv.className = 'scanner-message success'; 
                }

                const updates = {
                    statusCostura: 'Em Produção',
                    statusGeral: 'Costurando',
                    costuraDataInicio: new Date().toISOString().split('T')[0],
                    costuraUsuario: currentUserName, 
                    idAtelieResponsavel: currentUserName 
                };
                await updateTalaoInFirestore(talao.id, updates, entryMessageDiv, barcode);
            }
        });

        // --- Handler para Escaneamento de Saída ---
        barcodeInputExit.addEventListener('keypress', async (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();

                if (!isDataLoaded) {
                    exitMessageDiv.textContent = 'Aguarde o carregamento dos dados.';
                    exitMessageDiv.className = 'scanner-message error';
                    return;
                }

                let barcode = barcodeInputExit.value.trim();

                // Lógica de transformação do código de barras
                if (barcode.length > 0 && barcode.charAt(0) !== '1') {
                    barcode = '1' + barcode.substring(1);
                }

                barcodeInputExit.value = '';
                exitMessageDiv.textContent = 'Processando...';
                exitMessageDiv.className = 'scanner-message';

                if (!barcode) {
                    exitMessageDiv.textContent = 'Código de barras vazio.';
                    exitMessageDiv.className = 'scanner-message error';
                    return;
                }

                const talao = allTaloes.find(t => t.codigoBarrasIdentificador === barcode);

                if (!talao) {
                    exitMessageDiv.textContent = `Talão com código ${barcode} não encontrado.`;
                    exitMessageDiv.className = 'scanner-message error';
                    return;
                }

                if (talao.idAtelieResponsavel !== currentUserName) {
                    exitMessageDiv.textContent = `Talão ${barcode} não pertence ao seu ateliê (${talao.idAtelieResponsavel}).`;
                    exitMessageDiv.className = 'scanner-message error';
                    return;
                }

                if (talao.statusCostura !== 'Em Produção') {
                    exitMessageDiv.textContent = `Talão ${barcode} não está em produção para dar saída. Status atual: ${talao.statusCostura || 'N/A'}.`;
                    exitMessageDiv.className = 'scanner-message error';
                    return;
                }
                
                const updates = {
                    statusCostura: 'Finalizado',
                    statusGeral: 'Costurado',
                    dataSaidaCostura: new Date().toISOString().split('T')[0]
                };
                await updateTalaoInFirestore(talao.id, updates, exitMessageDiv, barcode);
            }
        });