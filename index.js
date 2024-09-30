const express = require('express');
const app = express();

app.use(express.json());

const port = process.env.PORT || 3000;

const TelegramApi = require('node-telegram-bot-api');
const admin = require('firebase-admin');
require('firebase/database');
const serviceAccount = require('/etc/secrets/serviceAccountKey.json');
const token = process.env.token;
const bot = new TelegramApi(token);

const firebaseConfig = {
  apiKey: "AIzaSyBtHCM_DxBzOc-uAzzJbgvl9uWCbr2NlTA",
  authDomain: "test-shop-c86c0.firebaseapp.com",
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://test-shop-c86c0-default-rtdb.firebaseio.com",
  projectId: "test-shop-c86c0",
  storageBucket: "test-shop-c86c0.appspot.com",
  messagingSenderId: "442194480617",
  appId: "1:442194480617:web:498da288a16a4d6d828f78"
};

admin.initializeApp(firebaseConfig);

// Получаем доступ к Realtime Database
const database = admin.database();

const URL = 'https://xamuraucshop-test.onrender.com';

bot.setWebHook(`${URL}/bot${token}`);

app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200); // Отправляем успешный ответ для Telegram
});

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID; // ID группы для отправки сообщений администраторам

database.ref('paymentDetails').once('value').then((snapshot) => {
  paymentDetails = snapshot.val() || "123456";
});

// Загрузка товаров
let products = [];

database.ref('products').once('value').then((snapshot) => {
  products = snapshot.val() || [  { label: '60', price: 88 },
    { label: '120', price: 176 },
    { label: '180', price: 264 },
    { label: '325', price: 445 },
    { label: '385', price: 520 },
    { label: '660', price: 870 },
    { label: '720', price: 910 },
    { label: '1800', price: 2150 },
    { label: '1920', price: 2300 },
    { label: '3850', price: 4100 },
    { label: '8100', price: 8200 },];
});

// Загрузка балансов пользователей
let userBalances = {};

database.ref('userBalances').once('value').then((snapshot) => {
  userBalances = snapshot.val() || {};
});

// Для ожидания суммы пополнения и отправки чека
let awaitingDeposit = {};  // Ожидание суммы для пополнения
let awaitingReceipt = {};  // Ожидание чека
let awaitingPubgId = {};   // Ожидание ввода PUBG ID от пользователя
let pendingChecks = {};    // Храним информацию о пользователях, чьи чеки ожидают подтверждения

// Главное меню с кнопками
const mainMenu = {
  reply_markup: {
    keyboard: [
      [{ text: 'Купить UC 💰' }],
      [{ text: 'Баланс 💳' }],
      [{ text: 'Реферальная система' }],
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  },
};

const adminMenu = {
  reply_markup: {
    keyboard: [
      [{ text: 'Купить UC 💰' }],
      [{ text: 'Баланс 💳' }],
      [{ text: 'Реферальная система' }],
      [{ text: 'Редактировать товары 🛠️' }, { text: 'Редактировать реквизиты 💳' }, { text: 'Редактировать баланс 💳' }],
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  },
};

const cancelMenu = {
  reply_markup: {
    keyboard: [
      [{ text: 'Отмена' }],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  },
};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const isAdmin = chatId.toString() === ADMIN_CHAT_ID;
  const menu = isAdmin ? adminMenu : mainMenu;
  if (!userBalances[chatId]) {
    userBalances[chatId] = 0; // Устанавливаем баланс, если он не был установлен

    // Сохраняем нового пользователя в базе данных
    database.ref(`userBalances/${chatId}`).set(userBalances[chatId])
      .then(() => {
        console.log(`New user added with ID: ${chatId}`);
      })
      .catch((error) => {
        console.error(`Error adding user to database: ${error}`);
      });
  } // Устанавливаем баланс, если он не был установлен
  bot.sendMessage(chatId, 'Добро пожаловать! Что вы хотите сделать?', menu);
});

bot.onText(/\/start (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const referrerId = match[1];  // Получаем реферальный ID
  const isAdmin = chatId.toString() === ADMIN_CHAT_ID;
  const menu = isAdmin ? adminMenu : mainMenu;

  // Проверяем, что пользователь не является своим собственным рефералом
  if (referrerId && referrerId !== chatId.toString()) {
    // Сохраняем реферала в базе данных
    database.ref(`referrals/${referrerId}/${chatId}`).set(true);
    bot.sendMessage(referrerId, `У вас новый реферал! ID: ${chatId}`);
  }

  if (!userBalances[chatId]) {
    userBalances[chatId] = 0; // Устанавливаем баланс, если он не был установлен

    // Сохраняем нового пользователя в базе данных
    database.ref(`userBalances/${chatId}`).set(userBalances[chatId])
      .then(() => {
        console.log(`New user added with ID: ${chatId}`);
      })
      .catch((error) => {
        console.error(`Error adding user to database: ${error}`);
      });
  } // Устанавливаем баланс, если он не был установлен
  bot.sendMessage(chatId, 'Добро пожаловать! Что вы хотите сделать?', menu);
});

// Получаем тег пользователя (имя пользователя или имя)
const getUserTag = (msg) => {
  const username = msg.from.username ? `@${msg.from.username}` : `${msg.from.first_name || 'Пользователь'}`;
  return username;
};

// Обработка сообщений от пользователя
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userTag = getUserTag(msg); // Получаем тег пользователя

  const replyToMessage = msg.reply_to_message;

  // Если сообщение пришло от админа и это ответ на пересланное сообщение
  
  const isAdmin = chatId.toString() === ADMIN_CHAT_ID;
  const menu = isAdmin ? adminMenu : mainMenu;
  
  if (isAdmin && replyToMessage) {
    const userId = replyToMessage.forward_from.id;

    // Пересылаем ответ админу пользователю
    bot.sendMessage(userId, `Ответ от администратора: ${msg.text}`);
    bot.sendMessage(ADMIN_CHAT_ID, `Ответ отправлен пользователю (ID: ${userId})`);
  }

  // Обработка отмены
  if (text === 'Отмена') {
    // Сбрасываем все ожидания
    awaitingPubgId[chatId] = false;
    awaitingDeposit[chatId] = false;
    awaitingReceipt[chatId] = false;

    // Возвращаем главное меню
    bot.sendMessage(chatId, 'Действие отменено. Вы вернулись в главное меню.', menu);
    return;
  }

  // Если бот ждет ID в PUBG
  if (awaitingPubgId[chatId]) {
    const pubgId = text; // Получаем ID пользователя в PUBG
    const purchaseInfo = awaitingPubgId[chatId];
    const itemPrice = purchaseInfo.price;

    // Проверяем баланс пользователя
    if (userBalances[chatId] >= itemPrice) {
      // Если достаточно средств, списываем деньги
      userBalances[chatId] -= itemPrice;

      // Отправляем информацию администратору с ID PUBG и товаром
      bot.sendMessage(ADMIN_CHAT_ID, `Пользователь ${userTag} (ID: ${chatId}) ввел PUBG ID: ${pubgId} для товара на сумму ${itemPrice}₽. Средства списаны с баланса.`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Заказ выполнен', callback_data: `order_completed_${chatId}` }],
          ],
        },
      });

      bot.sendMessage(chatId, `Спасибо! Ваш PUBG ID: ${pubgId} был отправлен администратору. С вашего баланса списано ${itemPrice}₽. Ожидайте обработки заказа.`, menu);
    } else {
      // Если недостаточно средств, сообщаем пользователю и предлагаем пополнить баланс
      const missingAmount = itemPrice - userBalances[chatId];
      bot.sendMessage(chatId, `Недостаточно средств на балансе для покупки этого товара. Вам не хватает ${missingAmount}₽.`);
      bot.sendMessage(chatId, 'Пожалуйста, пополните баланс, чтобы продолжить покупку.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Пополнить баланс', callback_data: 'deposit' }],
          ],
        },
      });
    }

    awaitingPubgId[chatId] = false; // Завершаем ожидание ID в PUBG
    return;
  }

  // Если бот ждет сумму для пополнения
  if (awaitingDeposit[chatId]) {
    const amount = parseFloat(text); // Преобразуем введенное значение в число

    if (isNaN(amount) || amount <= 0) {
      bot.sendMessage(chatId, 'Пожалуйста, введите корректную сумму для пополнения.');
      return;
    }

    // Сохраняем данные о пополнении для пользователя
    pendingChecks[chatId] = {
      amount: amount,
      userTag: userTag,
      userId: chatId
    };

    // Отправляем сообщение с реквизитами для перевода
    bot.sendMessage(chatId, `Отправьте деньги на следующие реквизиты:

${paymentDetails}

Сумма: ${amount}

В ОТВЕТНОМ СООБЩЕНИИ ПРИШЛИТЕ ЧЕК ТРАНЗАКЦИИ:`, cancelMenu);

    awaitingDeposit[chatId] = false;  // Завершаем ожидание суммы
    awaitingReceipt[chatId] = true;  // Начинаем ожидание чека
    return;
  }

  if (awaitingReceipt[chatId]) {
    // Пересылаем чек администратору
    bot.forwardMessage(ADMIN_CHAT_ID, chatId, msg.message_id);
    bot.sendMessage(chatId, 'Чек получен и отправлен администратору на проверку. Ожидайте подтверждения.', menu);
    
    // Оповещаем администратора о запросе на проверку чека
    const userInfo = pendingChecks[chatId];
    bot.sendMessage(ADMIN_CHAT_ID, `${userTag} (ID: ${chatId}) отправил чек для пополнения на сумму ${userInfo.amount}₽. Пожалуйста, проверьте.`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Подтвердить', callback_data: `confirm_${chatId}` }],
          [{ text: 'Отменить', callback_data: `reject_${chatId}` }],
        ],
      },
    });

    awaitingReceipt[chatId] = false;  // Завершаем ожидание чека
    return;
  }

  // Обычные команды
  if (text === 'Баланс 💳') {
    const balance = userBalances[chatId];
    bot.sendMessage(chatId, `Ваш текущий баланс: ${balance}₽`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Пополнить баланс', callback_data: 'deposit' }],
        ],
      },
    });
  } else if (text === 'Купить UC 💰') {
    const keyboard = [];
    for (let i = 0; i < products.length; i += 2) {
      const row = products.slice(i, i + 2).map(item => ({
        text: `${item.label} UC - ${item.price}₽`,
        callback_data: `buy_${item.label}_${item.price}`,
      }));
      keyboard.push(row);
    }
    bot.sendMessage(chatId, '🛒 Выберите товар:', {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  } else if (text === 'Реферальная система') {
    const referralLink = `https://t.me/SkeletonKingdomBot?start=${chatId}`;
    
    // Считаем количество рефералов
    database.ref(`referrals/${chatId}`).once('value', (snapshot) => {
      const referrals = snapshot.numChildren();
      
      bot.sendMessage(chatId, `Ваша реферальная ссылка: ${referralLink}. Вы пригласили ${referrals} рефералов. Пригласите друзей и получайте бонусы за их покупки!`);
    });
  } else if (text === 'Редактировать товары 🛠️') {
    const chatId = msg.chat.id;
    if (chatId.toString() !== ADMIN_CHAT_ID) {
      return; 
    }
  
    bot.sendMessage(chatId, 'Введите номер товара для изменения (например, 60):', cancelMenu);
    bot.once('message', (msg) => {
      if (msg.text === 'Отмена') {
        // Сброс ожидания и вывод сообщения об отмене
        bot.sendMessage(chatId, 'Изменение цены отменено.', menu);
        return;
      }

      const label = msg.text;
  
      // Проверка наличия товара
      const product = products.find(p => p.label === label);
      if (!product) {
        bot.sendMessage(chatId, `Товар с меткой ${label} не найден.`, menu);
        return;
      }
  
      // Запрашиваем новую цену
      bot.sendMessage(chatId, 'Введите новую цену:');
      bot.once('message', (msg) => {
        if (msg.text === 'Отмена') {
          // Сброс ожидания и вывод сообщения об отмене
          bot.sendMessage(chatId, 'Изменение цены отменено.', menu);
          return;
        }

        const newPrice = parseFloat(msg.text);
        if (isNaN(newPrice)) {
          bot.sendMessage(chatId, 'Пожалуйста, введите корректную цену.', menu);
          return;
        }
  
        // Обновляем цену товара
        product.price = newPrice;
        database.ref('products').set(products)
        .then(() => {
          bot.sendMessage(chatId, `Цена товара ${label} UC была изменена на ${newPrice}₽.`, menu);
        })
        .catch((error) => {
          bot.sendMessage(chatId, 'Ошибка сохранения данных в Firebase.', menu);
          console.error(error);
        });
      });
    });
  } else if (text === 'Редактировать реквизиты 💳') {
    const chatId = msg.chat.id;
    if (chatId.toString() !== ADMIN_CHAT_ID) {
      return;
    }
  
    bot.sendMessage(chatId, 'Введите новые реквизиты для пополнения:', cancelMenu);
    bot.once('message', (msg) => {
      if (msg.text === 'Отмена') {
        // Сброс ожидания и вывод сообщения об отмене
        bot.sendMessage(chatId, 'Изменение реквизитов отменено.', menu);
        return;
      }

      paymentDetails = msg.text;
      database.ref('paymentDetails').set(paymentDetails)
        .then(() => {
          bot.sendMessage(chatId, `Реквизиты были успешно изменены на: ${paymentDetails}`, menu);
        })
        .catch((error) => {
          bot.sendMessage(chatId, 'Ошибка сохранения реквизитов в Firebase.', menu);
          console.error(error);
        });
    });
  } else if (text === 'Редактировать баланс 💳') {
    const chatId = msg.chat.id;
    if (chatId.toString() !== ADMIN_CHAT_ID) {
      return; // Если это не администратор, игнорируем команду
    }
  
    bot.sendMessage(chatId, 'Введите ID пользователя, чей баланс вы хотите изменить:', cancelMenu);
    bot.once('message', (msg) => {
      if (msg.text === 'Отмена') {
        // Сброс ожидания и вывод сообщения об отмене
        bot.sendMessage(chatId, 'Изменение баланса отменено.', menu);
        return;
      }

      const userId = msg.text; // Получаем ID пользователя
  
      bot.sendMessage(chatId, 'Введите новую сумму для баланса:');
      bot.once('message', (msg) => {
        const newBalance = parseFloat(msg.text); // Получаем новую сумму
  
        if (isNaN(newBalance)) {
          bot.sendMessage(chatId, 'Пожалуйста, введите корректную сумму.', menu);
          return;
        }
  
        userBalances[userId] = newBalance; // Обновляем баланс пользователя
        database.ref('userBalances').set(userBalances)
          .then(() => {
            bot.sendMessage(chatId, `Баланс пользователя с ID ${userId} был изменен на ${newBalance}₽.`, menu);
          })
          .catch((error) => {
            bot.sendMessage(chatId, 'Ошибка сохранения данных в Firebase.', menu);
            console.error(error);
          });
      });
    });
  }
});

// Обработка нажатий на inline-кнопки
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (userBalances[chatId] === undefined) {
    userBalances[chatId] = 0;  // Устанавливаем начальный баланс для новых пользователей
  }

  // Проверяем нажатие на кнопки администратора
  if (data.startsWith('confirm_')) {
    const userId = data.split('_')[1];
    const userInfo = pendingChecks[userId];

    if (userInfo) {
      const depositAmount = userInfo.amount;

      // Обновляем баланс пользователя
      userBalances[userId] = (userBalances[userId] || 0) + depositAmount;

      database.ref('userBalances').set(userBalances);

      console.log(`referrals/${userId}`);

      // Проверяем, есть ли у этого пользователя реферера
      database.ref(`referrals/${userId}`).once('value', (snapshot) => {
        console.log("Snapshot Key: ", snapshot.key); 
        console.log("snapshot: " + snapshot.val());
        if (snapshot.exists()) {
          const referrerId = Object.keys(snapshot.val())[0];  // Получаем ID реферера
          const bonus = depositAmount * 0.005;  // 0.5% бонус

          console.log(bonus, 'id: ', referrerId)

          // Начисляем бонус рефереру
          userBalances[referrerId] = (userBalances[referrerId] || 0) + bonus;
          database.ref('userBalances').set(userBalances);

          // Сообщаем рефереру о бонусе
          bot.sendMessage(referrerId, `Ваш реферал пополнил баланс на ${depositAmount}₽. Вам начислено ${bonus}₽ в качестве бонуса.`);
        }
      });

      // Оповещаем администратора и пользователя
      bot.sendMessage(ADMIN_CHAT_ID, `Пополнение на ${depositAmount}₽ для ${userInfo.userTag} (ID: ${userId}) подтверждено.`);
      bot.sendMessage(userId, `Ваш баланс был пополнен на ${depositAmount}₽. Текущий баланс: ${userBalances[userId]}₽.`);

      // Очищаем информацию о запросе
      delete pendingChecks[userId];
    }
  } else if (data.startsWith('reject_')) {
    const userId = data.split('_')[1];
    const userInfo = pendingChecks[userId];

    if (userInfo) {
      // Оповещаем администратора и пользователя об отмене
      bot.sendMessage(ADMIN_CHAT_ID, `Пополнение на ${userInfo.amount}₽ для ${userInfo.userTag} (ID: ${userId}) отменено.`);
      bot.sendMessage(userId, `Ваше пополнение на сумму ${userInfo.amount}₽ было отклонено. Пожалуйста, попробуйте снова.`);

      // Очищаем информацию о запросе
      delete pendingChecks[userId];
    }
  } else if (data.startsWith('buy_')) {
    const [_, label, price] = data.split('_');; // Получаем метку товара (например, 60)
    const numericPrice = Number(price);
    
    // Запросить у пользователя его ID в PUBG
    bot.sendMessage(chatId, `Вы выбрали товар: ${label}UC за ${numericPrice}₽. Пожалуйста, введите ваш ID в PUBG:`, cancelMenu);
    
    // Сохраняем информацию о покупке и ожидаем ввода PUBG ID
    awaitingPubgId[chatId] = { label, price: numericPrice }; // Пример логики цены
    awaitingDeposit[chatId] = false; // Остановить ожидание депозита, если оно было активным
  } else if (data.startsWith('order_completed_')) {
    const userId = data.split('_')[2]; // Получаем ID покупателя из callback_data

    // Сообщаем администратору о выполнении заказа
    bot.sendMessage(ADMIN_CHAT_ID, `Заказ для пользователя с ID ${userId} был выполнен.`);

    // Сообщаем покупателю, что его заказ выполнен
    bot.sendMessage(userId, 'Ваш заказ был выполнен! Спасибо за покупку. Пожалуйста, напишите отзыв в группе и помогите улучшить качество работы. https://t.me/+Q6biAiRMhNszZGUy');

    return;
  }else if (data === 'deposit') {
    // Бот запрашивает сумму для пополнения
    bot.sendMessage(chatId, 'Введите сумму, на которую вы хотите пополнить баланс:', cancelMenu);
    awaitingDeposit[chatId] = true;  // Ожидание суммы для пополнения
  }
});

// Запуск бота
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});